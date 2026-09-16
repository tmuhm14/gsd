import { z } from "zod";
import { BUCKETS, ITEM_KINDS } from "@/lib/gtd";

/**
 * What the AI may return, and nothing more.
 *
 * The AI layer never writes to the database. It returns a *proposal*, the UI
 * shows it, and applying it goes through the ordinary `items.update` mutation.
 * That keeps one write path, makes every AI change undoable by the user before
 * it lands, and means a prompt-injected response can't quietly edit a note.
 */
export const AI_ACTIONS = [
  "clarify",
  "breakdown",
  "research",
  "summarize",
] as const;

export type AiAction = (typeof AI_ACTIONS)[number];

export const AI_ACTION_LABELS: Record<AiAction, string> = {
  clarify: "Clarify",
  breakdown: "Break into next actions",
  research: "Research",
  summarize: "Summarize",
};

/**
 * Limits live in the descriptions, not as `min`/`max` constraints.
 *
 * Two reasons. The API rejects array size keywords in a structured-output
 * schema outright (the macOS client hit a 400 on `maxItems`). And a Zod
 * constraint is also enforced when *parsing* the reply, so a model returning
 * one extra context would fail the whole call instead of being trimmed. The
 * caller clamps instead — see MAX_CONTEXTS / MAX_BREAKDOWN_ACTIONS.
 */
export const MAX_CONTEXTS = 5;
export const MAX_BREAKDOWN_ACTIONS = 12;

/** GTD triage of a captured item. */
export const clarifySchema = z.object({
  bucket: z.enum(BUCKETS),
  kind: z.enum(ITEM_KINDS),
  contexts: z
    .array(z.string())
    .describe(`At most ${MAX_CONTEXTS} lowercase single-word contexts`),
  nextAction: z
    .string()
    .describe("A single concrete physical next action, or empty if not actionable"),
  rationale: z.string().describe("One short sentence explaining the call"),
});

export const breakdownSchema = z.object({
  actions: z
    .array(z.string())
    .describe(
      `Between 1 and ${MAX_BREAKDOWN_ACTIONS} concrete physical next actions, each doable in one sitting`,
    ),
});

export const summarizeSchema = z.object({
  summary: z.string().describe("A tightened version of the note, in markdown"),
});

export type ClarifyProposal = z.infer<typeof clarifySchema>;
export type BreakdownProposal = z.infer<typeof breakdownSchema>;

export type Source = { title: string; url: string };

/** Discriminated by action so the UI can render each shape properly. */
export type Proposal =
  | ({ action: "clarify" } & ClarifyProposal)
  | ({ action: "breakdown" } & BreakdownProposal)
  | { action: "research"; markdown: string; sources: Source[] }
  | { action: "summarize"; summary: string };
