import type { Proposal } from "@/server/ai/proposals";
import type { Bucket, Energy, ItemKind } from "@/lib/gtd";

export type ItemChanges = {
  body?: string;
  bucket?: Bucket;
  kind?: ItemKind;
  energy?: Energy | null;
};

/**
 * Turns a proposal into the edit it would make, without performing it.
 *
 * Kept pure and separate from the UI so the "what will Apply do" question has
 * a testable answer. Every path appends rather than replaces — an AI action
 * should never be able to destroy text the user wrote.
 */
export function applyProposal(body: string, proposal: Proposal): ItemChanges {
  switch (proposal.action) {
    case "clarify": {
      const changes: ItemChanges = {
        bucket: proposal.bucket,
        kind: proposal.kind,
      };
      // Contexts are derived from @tags in the body, so a suggested context
      // only sticks if it's written into the text.
      const additions: string[] = [];
      if (proposal.nextAction.trim()) {
        additions.push(`- [ ] ${proposal.nextAction.trim()}`);
      }
      const newContexts = proposal.contexts
        .map((context) => context.trim().toLowerCase())
        .filter((context) => context && !body.toLowerCase().includes(`@${context}`));
      if (newContexts.length > 0) {
        additions.push(newContexts.map((context) => `@${context}`).join(" "));
      }
      if (additions.length > 0) {
        changes.body = appendSection(body, "Next action", additions.join("\n"));
      }
      return changes;
    }

    case "breakdown": {
      const checklist = proposal.actions
        .map((action) => `- [ ] ${action.trim()}`)
        .join("\n");
      return { body: appendSection(body, "Next actions", checklist) };
    }

    case "research": {
      const sources = proposal.sources
        .map((source) => `- [${source.title}](${source.url})`)
        .join("\n");
      const content = sources
        ? `${proposal.markdown}\n\n**Sources**\n${sources}`
        : proposal.markdown;
      return { body: appendSection(body, "Research", content) };
    }

    case "summarize":
      return { body: appendSection(body, "Summary", proposal.summary) };
  }
}

/** Appends a `## heading` block, leaving existing content untouched. */
function appendSection(body: string, heading: string, content: string): string {
  const trimmed = body.replace(/\s+$/, "");
  return `${trimmed}\n\n## ${heading}\n${content.trim()}\n`;
}
