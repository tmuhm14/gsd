import { describe, expect, it } from "vitest";
import { applyProposal } from "@/lib/applyProposal";
import type { Proposal } from "@/server/ai/proposals";
import { deriveTitle, parseContexts } from "@/lib/markdown";

const body = "Fix the fax retry bug\nit drops on 500s";

describe("clarify", () => {
  it("sets bucket and kind, and appends the next action as a checkbox", () => {
    const changes = applyProposal(body, {
      action: "clarify",
      bucket: "next",
      kind: "action",
      contexts: ["mac"],
      nextAction: "Reproduce the 500 locally",
      rationale: "single concrete step",
    });

    expect(changes.bucket).toBe("next");
    expect(changes.kind).toBe("action");
    expect(changes.body).toContain("- [ ] Reproduce the 500 locally");
    expect(changes.body).toContain("@mac");
  });

  it("does not duplicate a context the note already has", () => {
    const changes = applyProposal("Call the vendor @calls", {
      action: "clarify",
      bucket: "next",
      kind: "action",
      contexts: ["calls"],
      nextAction: "",
      rationale: "",
    });

    expect(parseContexts(changes.body ?? "Call the vendor @calls")).toEqual([
      "calls",
    ]);
  });

  it("leaves the body untouched when there is nothing to add", () => {
    const changes = applyProposal(body, {
      action: "clarify",
      bucket: "reference",
      kind: "note",
      contexts: [],
      nextAction: "   ",
      rationale: "not actionable",
    });

    expect(changes.body).toBeUndefined();
    expect(changes.bucket).toBe("reference");
  });
});

describe("breakdown", () => {
  it("appends each action as its own checkbox", () => {
    const changes = applyProposal(body, {
      action: "breakdown",
      actions: ["Reproduce it", "Add a retry test"],
    });

    expect(changes.body).toContain("- [ ] Reproduce it");
    expect(changes.body).toContain("- [ ] Add a retry test");
  });
});

describe("research", () => {
  it("appends findings with a sources list", () => {
    const changes = applyProposal(body, {
      action: "research",
      markdown: "InterFAX retries 500s twice.",
      sources: [{ title: "InterFAX docs", url: "https://example.com/docs" }],
    });

    expect(changes.body).toContain("## Research");
    expect(changes.body).toContain("[InterFAX docs](https://example.com/docs)");
  });

  it("omits the sources block when the search returned none", () => {
    const changes = applyProposal(body, {
      action: "research",
      markdown: "Nothing conclusive.",
      sources: [],
    });

    expect(changes.body).not.toContain("**Sources**");
  });
});

describe("every action", () => {
  const proposals: Proposal[] = [
    {
      action: "clarify",
      bucket: "next",
      kind: "action",
      contexts: ["mac"],
      nextAction: "Do it",
      rationale: "x",
    },
    { action: "breakdown", actions: ["Step one"] },
    { action: "research", markdown: "Found things", sources: [] },
    { action: "summarize", summary: "Short version" },
  ];

  it("never drops the text the user already wrote", () => {
    for (const proposal of proposals) {
      const changes = applyProposal(body, proposal);
      if (changes.body !== undefined) {
        expect(changes.body).toContain("Fix the fax retry bug");
        expect(changes.body).toContain("it drops on 500s");
      }
    }
  });

  it("never changes the note's title", () => {
    for (const proposal of proposals) {
      const changes = applyProposal(body, proposal);
      if (changes.body !== undefined) {
        expect(deriveTitle(changes.body)).toBe("Fix the fax retry bug");
      }
    }
  });
});
