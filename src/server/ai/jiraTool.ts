import type Anthropic from "@anthropic-ai/sdk";
import { fetchIssue, isConfigured, JiraError } from "@/server/jira/client";

/**
 * The `jira_lookup` tool Claude can call while working on a note.
 *
 * Read-only by construction: there is one operation, fetching an issue by key.
 * The model cannot search, write, or transition anything, so the worst a bad
 * generation can do is fetch a ticket that wasn't relevant.
 */
export const JIRA_TOOL_NAME = "jira_lookup";

export const jiraTool = {
  name: JIRA_TOOL_NAME,
  description:
    "Look up a Jira issue by its key (for example WH-1234) and return its " +
    "summary, status, assignee, description and recent comments. Use this " +
    "whenever the note mentions an issue key and the ticket's content would " +
    "change your answer.",
  input_schema: {
    type: "object" as const,
    properties: {
      key: {
        type: "string",
        description: "The issue key, e.g. WH-1234",
      },
    },
    required: ["key"],
    additionalProperties: false,
  },
} satisfies Anthropic.Tool;

/** Only offered when Jira is actually configured. */
export function availableTools(): Anthropic.Tool[] {
  return isConfigured() ? [jiraTool] : [];
}

/**
 * Runs the tool and renders the result as text for the model.
 *
 * A Jira failure comes back as a tool result rather than throwing: the model
 * should be able to say "I couldn't read WH-1234" and still finish the job,
 * instead of the whole action erroring out.
 */
export async function runJiraTool(
  input: unknown,
): Promise<{ content: string; isError: boolean }> {
  const key =
    typeof input === "object" && input !== null && "key" in input
      ? String((input as { key: unknown }).key)
      : "";

  if (!key) {
    return { content: "No issue key was provided.", isError: true };
  }

  try {
    const issue = await fetchIssue(key);
    return { content: render(issue), isError: false };
  } catch (error) {
    const message =
      error instanceof JiraError ? error.message : "Jira lookup failed.";
    return { content: message, isError: true };
  }
}

function render(issue: Awaited<ReturnType<typeof fetchIssue>>): string {
  const lines = [
    `${issue.key}: ${issue.summary}`,
    `Status: ${issue.status} | Type: ${issue.type}${
      issue.priority ? ` | Priority: ${issue.priority}` : ""
    }`,
    `Assignee: ${issue.assignee ?? "unassigned"} | Reporter: ${issue.reporter ?? "unknown"}`,
    issue.labels.length > 0 ? `Labels: ${issue.labels.join(", ")}` : null,
    `Updated: ${issue.updated}`,
    `URL: ${issue.url}`,
    "",
    issue.description ? `Description:\n${issue.description}` : "Description: (empty)",
  ].filter((line): line is string => line !== null);

  if (issue.comments.length > 0) {
    lines.push("", `Comments (${issue.comments.length}, newest first):`);
    for (const comment of issue.comments) {
      lines.push(`- ${comment.author} (${comment.created}): ${comment.body}`);
    }
  }

  return lines.join("\n");
}
