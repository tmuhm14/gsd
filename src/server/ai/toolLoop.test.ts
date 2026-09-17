import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { runWithTools, textOf } from "@/server/ai/toolLoop";

const runJiraTool = vi.fn();
vi.mock("@/server/ai/jiraTool", () => ({
  JIRA_TOOL_NAME: "jira_lookup",
  runJiraTool: (input: unknown) => runJiraTool(input),
  availableTools: () => [],
}));

function textMessage(text: string): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: [{ type: "text", text, citations: null }],
  } as unknown as Anthropic.Message;
}

function toolCallMessage(...keys: string[]): Anthropic.Message {
  return {
    id: "msg_tool",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    stop_reason: "tool_use",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
    content: keys.map((key, index) => ({
      type: "tool_use",
      id: `call_${index}`,
      name: "jira_lookup",
      input: { key },
    })),
  } as unknown as Anthropic.Message;
}

/** A client whose `create` returns the queued messages in order. */
function makeClient(queue: Anthropic.Message[]) {
  const create = vi.fn(
    async (_request: Anthropic.MessageCreateParams) =>
      queue.shift() ?? textMessage("fallback"),
  );
  const finalMessage = vi.fn(async () => queue.shift() ?? textMessage("fallback"));
  const stream = vi.fn(() => ({ finalMessage }));
  return {
    client: { messages: { create, stream } } as unknown as Anthropic,
    create,
    stream,
  };
}

const params = {
  model: "claude-opus-5",
  max_tokens: 100,
  messages: [{ role: "user" as const, content: "hi" }],
  tools: [],
} as unknown as Anthropic.MessageCreateParamsNonStreaming;

describe("runWithTools", () => {
  it("returns immediately when no tool is called", async () => {
    const { client, create } = makeClient([textMessage("done")]);

    const result = await runWithTools(client, params);

    expect(result.text).toBe("done");
    expect(result.toolsUsed).toEqual([]);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("runs a tool call and feeds the result back", async () => {
    runJiraTool.mockResolvedValue({ content: "WH-1: Fix it", isError: false });
    const { client, create } = makeClient([
      toolCallMessage("WH-1"),
      textMessage("answer using the ticket"),
    ]);

    const result = await runWithTools(client, params);

    expect(runJiraTool).toHaveBeenCalledWith({ key: "WH-1" });
    expect(result.text).toBe("answer using the ticket");
    expect(result.toolsUsed).toEqual(["jira_lookup"]);

    // The follow-up request carries the assistant turn and the tool results.
    const followUp = create.mock.calls[1]![0];
    expect(followUp.messages).toHaveLength(3);
    expect(followUp.messages[2]?.role).toBe("user");
  });

  it("returns all parallel tool results in a single user message", async () => {
    runJiraTool.mockResolvedValue({ content: "ok", isError: false });
    const { client, create } = makeClient([
      toolCallMessage("WH-1", "WH-2"),
      textMessage("done"),
    ]);

    await runWithTools(client, params);

    const followUp = create.mock.calls[1]![0];
    const lastMessage = followUp.messages.at(-1);
    // Splitting these across messages teaches the model to stop parallelising.
    expect(Array.isArray(lastMessage?.content)).toBe(true);
    expect(lastMessage?.content).toHaveLength(2);
  });

  it("passes a tool failure back as an error result, not an exception", async () => {
    runJiraTool.mockResolvedValue({ content: "Issue not found.", isError: true });
    const { client, create } = makeClient([
      toolCallMessage("WH-404"),
      textMessage("I couldn't read that ticket"),
    ]);

    const result = await runWithTools(client, params);

    const followUp = create.mock.calls[1]![0];
    const results = followUp.messages.at(-1)?.content as { is_error?: boolean }[];
    expect(results[0]?.is_error).toBe(true);
    expect(result.text).toBe("I couldn't read that ticket");
  });

  it("reports an unknown tool instead of hanging", async () => {
    const unknown = {
      ...toolCallMessage("WH-1"),
      content: [
        { type: "tool_use", id: "c1", name: "delete_everything", input: {} },
      ],
    } as unknown as Anthropic.Message;
    const { client, create } = makeClient([unknown, textMessage("ok")]);

    await runWithTools(client, params);

    const followUp = create.mock.calls[1]![0];
    const results = followUp.messages.at(-1)?.content as { content?: string }[];
    expect(results[0]?.content).toContain("Unknown tool");
    expect(runJiraTool).not.toHaveBeenCalled();
  });

  it("stops after the turn limit and answers with tools withheld", async () => {
    runJiraTool.mockResolvedValue({ content: "ok", isError: false });
    // Always asks for another tool call — the loop must not spin forever.
    const { client, create } = makeClient([]);
    create.mockImplementation(async (request) =>
      request.tools === undefined ? textMessage("forced answer") : toolCallMessage("WH-1"),
    );

    const result = await runWithTools(client, params);

    expect(result.text).toBe("forced answer");
    expect(create.mock.calls.length).toBeLessThanOrEqual(8);
  });

  it("throws on a policy refusal rather than returning empty text", async () => {
    const refusal = {
      ...textMessage(""),
      stop_reason: "refusal",
    } as unknown as Anthropic.Message;
    const { client } = makeClient([refusal]);

    await expect(runWithTools(client, params)).rejects.toThrow(/declined/i);
  });

  it("uses the streaming path when asked, and collects every turn", async () => {
    runJiraTool.mockResolvedValue({ content: "ok", isError: false });
    const { client, stream } = makeClient([
      toolCallMessage("WH-1"),
      textMessage("streamed answer"),
    ]);

    const result = await runWithTools(client, params, { stream: true });

    expect(stream).toHaveBeenCalled();
    expect(result.text).toBe("streamed answer");
    // Citations can arrive on any turn, so all responses are kept.
    expect(result.responses).toHaveLength(2);
  });
});

describe("textOf", () => {
  it("joins text blocks and ignores the rest", () => {
    const message = {
      ...textMessage("first"),
      content: [
        { type: "text", text: "first" },
        { type: "tool_use", id: "x", name: "y", input: {} },
        { type: "text", text: "second" },
      ],
    } as unknown as Anthropic.Message;

    expect(textOf(message)).toBe("first\nsecond");
  });
});
