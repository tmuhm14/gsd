import { env } from "@/env";
import { adfToText, tidy } from "@/server/jira/adf";

/**
 * Read-only Jira Cloud client: fetch an issue by key.
 *
 * PHI NOTE: Waltz is a HIPAA-covered entity and Jira issues can contain
 * patient detail in descriptions and comments. This client fetches those
 * fields, and whatever it returns is sent to the Anthropic API as tool
 * results. Nothing here is ever written to application logs — see the catch
 * blocks, which deliberately log neither ticket content nor error bodies.
 */

export type JiraComment = {
  author: string;
  created: string;
  body: string;
};

export type JiraIssue = {
  key: string;
  url: string;
  summary: string;
  status: string;
  type: string;
  priority: string | null;
  assignee: string | null;
  reporter: string | null;
  labels: string[];
  created: string;
  updated: string;
  description: string;
  comments: JiraComment[];
};

/** Bounds what one lookup can drag into the context window. */
const MAX_DESCRIPTION = 6_000;
const MAX_COMMENT = 2_000;
const MAX_COMMENTS = 20;

export class JiraError extends Error {}

export function isConfigured(): boolean {
  return Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN);
}

/**
 * `WH-1234` — uppercase project key, dash, digits. Two or more characters in
 * the key, because Jira itself requires that.
 */
export const ISSUE_KEY_PATTERN = /^[A-Z][A-Z0-9]+-\d+$/;

export function extractIssueKeys(text: string, limit = 5): string[] {
  // Built fresh rather than reusing a module-level /g/ regex, whose lastIndex
  // would carry between calls.
  const found = text.match(/\b[A-Z][A-Z0-9]+-\d+\b/g) ?? [];
  return [...new Set(found)].slice(0, limit);
}

function authHeader(): string {
  const token = Buffer.from(`${env.JIRA_EMAIL}:${env.JIRA_API_TOKEN}`).toString(
    "base64",
  );
  return `Basic ${token}`;
}

async function request(path: string): Promise<unknown> {
  if (!isConfigured()) {
    throw new JiraError("Jira is not configured.");
  }

  const base = env.JIRA_BASE_URL!.replace(/\/$/, "");
  const response = await fetch(`${base}${path}`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    // A slow Jira shouldn't hold an AI request open indefinitely.
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 404) {
    throw new JiraError("Issue not found, or you don't have access to it.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new JiraError("Jira rejected the credentials.");
  }
  if (!response.ok) {
    // Deliberately not including the body: it can echo issue content.
    throw new JiraError(`Jira request failed (${response.status}).`);
  }
  return response.json();
}

type RawIssue = {
  key?: string;
  fields?: {
    summary?: string;
    status?: { name?: string };
    issuetype?: { name?: string };
    priority?: { name?: string };
    assignee?: { displayName?: string };
    reporter?: { displayName?: string };
    labels?: string[];
    created?: string;
    updated?: string;
    description?: unknown;
  };
};

type RawComments = {
  comments?: {
    author?: { displayName?: string };
    created?: string;
    body?: unknown;
  }[];
};

export async function fetchIssue(key: string): Promise<JiraIssue> {
  const normalised = key.trim().toUpperCase();
  if (!ISSUE_KEY_PATTERN.test(normalised)) {
    throw new JiraError(`"${key}" is not a Jira issue key.`);
  }

  const fields = [
    "summary",
    "status",
    "issuetype",
    "priority",
    "assignee",
    "reporter",
    "labels",
    "created",
    "updated",
    "description",
  ].join(",");

  const issue = (await request(
    `/rest/api/3/issue/${normalised}?fields=${fields}`,
  )) as RawIssue;

  const comments = (await request(
    `/rest/api/3/issue/${normalised}/comment?maxResults=${MAX_COMMENTS}&orderBy=-created`,
  ).catch(() => ({ comments: [] }))) as RawComments;

  const base = env.JIRA_BASE_URL!.replace(/\/$/, "");

  return {
    key: issue.key ?? normalised,
    url: `${base}/browse/${issue.key ?? normalised}`,
    summary: issue.fields?.summary ?? "",
    status: issue.fields?.status?.name ?? "Unknown",
    type: issue.fields?.issuetype?.name ?? "Unknown",
    priority: issue.fields?.priority?.name ?? null,
    assignee: issue.fields?.assignee?.displayName ?? null,
    reporter: issue.fields?.reporter?.displayName ?? null,
    labels: issue.fields?.labels ?? [],
    created: issue.fields?.created ?? "",
    updated: issue.fields?.updated ?? "",
    description: tidy(adfToText(issue.fields?.description), MAX_DESCRIPTION),
    comments: (comments.comments ?? []).slice(0, MAX_COMMENTS).map((comment) => ({
      author: comment.author?.displayName ?? "Unknown",
      created: comment.created ?? "",
      body: tidy(adfToText(comment.body), MAX_COMMENT),
    })),
  };
}
