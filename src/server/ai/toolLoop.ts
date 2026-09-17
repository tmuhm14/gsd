import Anthropic from "@anthropic-ai/sdk";
import { JIRA_TOOL_NAME, runJiraTool } from "@/server/ai/jiraTool";

/**
 * The tool-use loop.
 *
 * Written by hand rather than using the SDK's tool runner because these calls
 * also need `output_config.format` for structured output, and the runner owns
 * the request it sends. The loop is small: ask, run any tool the model called,
 * hand back the results, repeat.
 */

/** A tool call is one Jira fetch; a handful is plenty for one note. */
const MAX_TURNS = 6;

export type LoopResult = {
  text: string;
  message: Anthropic.Message;
  /**
   * Every assistant message in the loop. Server-tool results (web search)
   * land on the turn that produced them, so a caller collecting citations has
   * to look at all of them, not just the last.
   */
  responses: Anthropic.Message[];
  /** Which tools ran, for surfacing in the UI. */
  toolsUsed: string[];
};

export async function runWithTools(
  client: Anthropic,
  params: Anthropic.MessageCreateParamsNonStreaming,
  /**
   * Stream the request. Needed when a search-and-read loop or a large
   * max_tokens could otherwise outlast the HTTP timeout.
   */
  options: { stream?: boolean } = {},
): Promise<LoopResult> {
  const messages: Anthropic.MessageParam[] = [...params.messages];
  const toolsUsed: string[] = [];
  const responses: Anthropic.Message[] = [];

  // `tools` is passed explicitly rather than defaulted: a default parameter
  // fires on an explicit `undefined`, which silently re-sent the tools on the
  // final tools-withheld request and left it looping to an empty answer.
  const send = async (
    turnMessages: Anthropic.MessageParam[],
    tools: Anthropic.MessageCreateParams["tools"],
  ) =>
    options.stream
      ? client.messages.stream({ ...params, tools, messages: turnMessages }).finalMessage()
      : client.messages.create({ ...params, tools, messages: turnMessages });

  for (let turn = 0; turn < MAX_TURNS; turn += 1) {
    const message = await send(messages, params.tools);
    responses.push(message);

    // A policy decline arrives as HTTP 200 with empty content.
    if (message.stop_reason === "refusal") {
      throw new Error("The request was declined by the model's safety system.");
    }

    if (message.stop_reason !== "tool_use") {
      return { text: textOf(message), message, responses, toolsUsed };
    }

    const calls = message.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
    );

    // Results for every call go back in one user message — splitting them
    // teaches the model to stop calling tools in parallel.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      toolsUsed.push(call.name);
      const outcome =
        call.name === JIRA_TOOL_NAME
          ? await runJiraTool(call.input)
          : { content: `Unknown tool: ${call.name}`, isError: true };

      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: outcome.content,
        is_error: outcome.isError,
      });
    }

    messages.push({ role: "assistant", content: message.content });
    messages.push({ role: "user", content: results });
  }

  // Out of turns: ask once more with tools withheld so we still get an answer.
  const final = await send(messages, undefined);
  responses.push(final);
  return { text: textOf(final), message: final, responses, toolsUsed };
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}
