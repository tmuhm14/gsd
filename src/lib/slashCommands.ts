import type { Bucket, Energy, ItemKind } from "@/lib/gtd";

/**
 * The `/` palette, mirroring the macOS app's catalogue. Block commands rewrite
 * the current line's marker; the rest change the item's GTD attributes.
 */
export type SlashAction =
  | { type: "marker"; marker: string }
  | { type: "insert"; text: string }
  | { type: "bucket"; bucket: Bucket }
  | { type: "kind"; kind: ItemKind }
  | { type: "energy"; energy: Energy }
  | { type: "due"; days: number }
  | { type: "defer"; days: number }
  | { type: "clearDates" };

export type SlashCommand = {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  group: "Blocks" | "Organize" | "Dates";
  action: SlashAction;
};

export const SLASH_COMMANDS: SlashCommand[] = [
  { id: "text", title: "Text", subtitle: "Plain paragraph", keywords: ["paragraph", "plain"], group: "Blocks", action: { type: "marker", marker: "" } },
  { id: "h1", title: "Heading 1", subtitle: "Big section heading", keywords: ["h1", "title"], group: "Blocks", action: { type: "marker", marker: "# " } },
  { id: "h2", title: "Heading 2", subtitle: "Medium heading", keywords: ["h2"], group: "Blocks", action: { type: "marker", marker: "## " } },
  { id: "h3", title: "Heading 3", subtitle: "Small heading", keywords: ["h3"], group: "Blocks", action: { type: "marker", marker: "### " } },
  { id: "todo", title: "To-do", subtitle: "Checkbox item", keywords: ["task", "checkbox", "check"], group: "Blocks", action: { type: "marker", marker: "- [ ] " } },
  { id: "bullet", title: "Bulleted list", subtitle: "Simple bullet", keywords: ["list", "ul"], group: "Blocks", action: { type: "marker", marker: "- " } },
  { id: "numbered", title: "Numbered list", subtitle: "Ordered list item", keywords: ["ol", "ordered"], group: "Blocks", action: { type: "marker", marker: "1. " } },
  { id: "quote", title: "Quote", subtitle: "Callout or quotation", keywords: ["blockquote"], group: "Blocks", action: { type: "marker", marker: "> " } },
  { id: "divider", title: "Divider", subtitle: "Horizontal rule", keywords: ["hr", "rule"], group: "Blocks", action: { type: "insert", text: "---\n" } },
  { id: "context", title: "Context", subtitle: "Insert an @context tag", keywords: ["tag", "at"], group: "Blocks", action: { type: "insert", text: "@" } },

  { id: "next", title: "Next action", subtitle: "Move to Next Actions", keywords: ["do", "gtd"], group: "Organize", action: { type: "bucket", bucket: "next" } },
  { id: "waiting", title: "Waiting for", subtitle: "Delegated to someone", keywords: ["delegate", "blocked"], group: "Organize", action: { type: "bucket", bucket: "waiting" } },
  { id: "scheduled", title: "Scheduled", subtitle: "Happens on a day", keywords: ["calendar"], group: "Organize", action: { type: "bucket", bucket: "scheduled" } },
  { id: "someday", title: "Someday / maybe", subtitle: "Incubate for later", keywords: ["maybe", "later"], group: "Organize", action: { type: "bucket", bucket: "someday" } },
  { id: "reference", title: "Reference", subtitle: "Not actionable", keywords: ["file", "keep"], group: "Organize", action: { type: "bucket", bucket: "reference" } },
  { id: "project", title: "Project", subtitle: "Outcome needing >1 action", keywords: ["outcome"], group: "Organize", action: { type: "kind", kind: "project" } },
  { id: "task", title: "Task", subtitle: "Mark as an action", keywords: ["action"], group: "Organize", action: { type: "kind", kind: "action" } },
  { id: "energy-low", title: "Low energy", subtitle: "Brain-dead work", keywords: ["easy"], group: "Organize", action: { type: "energy", energy: "low" } },
  { id: "energy-high", title: "High energy", subtitle: "Needs real focus", keywords: ["deep"], group: "Organize", action: { type: "energy", energy: "high" } },

  { id: "due-today", title: "Due today", subtitle: "Deadline today", keywords: ["deadline"], group: "Dates", action: { type: "due", days: 0 } },
  { id: "due-tomorrow", title: "Due tomorrow", subtitle: "Deadline tomorrow", keywords: ["deadline"], group: "Dates", action: { type: "due", days: 1 } },
  { id: "due-week", title: "Due in a week", subtitle: "Deadline 7 days out", keywords: ["deadline"], group: "Dates", action: { type: "due", days: 7 } },
  { id: "defer-tomorrow", title: "Start tomorrow", subtitle: "Hide until tomorrow", keywords: ["snooze", "defer"], group: "Dates", action: { type: "defer", days: 1 } },
  { id: "clear-dates", title: "Clear dates", subtitle: "Remove due and start", keywords: ["reset"], group: "Dates", action: { type: "clearDates" } },
];

export function filterCommands(query: string): SlashCommand[] {
  const q = query.trim().toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (command) =>
      command.title.toLowerCase().includes(q) ||
      command.keywords.some((keyword) => keyword.includes(q)),
  );
}

/** Days from today at midnight, matching the Mac app's date shortcuts. */
export function relativeDate(days: number, from = new Date()): Date {
  const date = new Date(from);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * Finds an active `/query` immediately before the caret, if there is one.
 * Returns null when the caret isn't in a slash session, so the caller can
 * leave typing alone.
 */
export function activeSlashQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const slash = before.lastIndexOf("/");
  if (slash < 0) return null;

  // Must start a word, and must not have been closed by whitespace.
  const preceding = slash === 0 ? " " : before[slash - 1];
  if (preceding !== undefined && !/\s/.test(preceding)) return null;

  const query = before.slice(slash + 1);
  if (/\s/.test(query)) return null;

  return { start: slash, query };
}
