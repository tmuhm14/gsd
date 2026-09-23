import { describe, expect, it } from "vitest";
import { BUCKETS, BUCKET_LABELS, CLARIFY_BUCKETS } from "@/lib/gtd";
import { filterCommands } from "@/lib/slashCommands";

describe("buckets", () => {
  it("puts Quick Notes first, before the inbox", () => {
    expect(BUCKETS[0]).toBe("quick");
    expect(BUCKET_LABELS.quick).toBe("Quick Notes");
  });

  it("lets you file into Quick Notes but not Trash", () => {
    expect(CLARIFY_BUCKETS).toContain("quick");
    expect(CLARIFY_BUCKETS).not.toContain("trash");
  });

  it("labels every bucket", () => {
    for (const bucket of BUCKETS) {
      expect(BUCKET_LABELS[bucket]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  /// The macOS enum and the database CHECK constraint list these literally.
  it("matches the vocabulary the other two layers expect", () => {
    expect([...BUCKETS].sort()).toEqual(
      [
        "done",
        "inbox",
        "next",
        "quick",
        "reference",
        "scheduled",
        "someday",
        "trash",
        "waiting",
      ].sort(),
    );
  });
});

describe("the link command", () => {
  it("is findable by the words people reach for", () => {
    for (const query of ["link", "url", "http"]) {
      expect(filterCommands(query).map((command) => command.id)).toContain("link");
    }
  });

  it("inserts a markdown link skeleton", () => {
    const link = filterCommands("link").find((command) => command.id === "link");
    expect(link?.action).toEqual({ type: "insert", text: "[](https://)" });
  });
});
