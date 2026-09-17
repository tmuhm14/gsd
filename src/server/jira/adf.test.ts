import { describe, expect, it } from "vitest";
import { adfToText, tidy } from "@/server/jira/adf";

/**
 * Jira Cloud v3 returns descriptions and comments as a node tree. Without
 * flattening, the model receives JSON structure instead of prose.
 */
describe("adfToText", () => {
  it("flattens paragraphs", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First line." }] },
        { type: "paragraph", content: [{ type: "text", text: "Second line." }] },
      ],
    };
    expect(adfToText(doc).trim()).toBe("First line.\nSecond line.");
  });

  it("renders bullet lists as markdown", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "one" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "two" }] }] },
          ],
        },
      ],
    };
    expect(adfToText(doc)).toContain("- one");
    expect(adfToText(doc)).toContain("- two");
  });

  it("uses a mention's display text, which lives in attrs", () => {
    const doc = {
      type: "paragraph",
      content: [
        { type: "text", text: "cc " },
        { type: "mention", attrs: { id: "abc", text: "@Sam" } },
      ],
    };
    expect(adfToText(doc).trim()).toBe("cc @Sam");
  });

  it("keeps code blocks fenced", () => {
    const doc = {
      type: "codeBlock",
      content: [{ type: "text", text: "throw new Error()" }],
    };
    expect(adfToText(doc)).toContain("```");
    expect(adfToText(doc)).toContain("throw new Error()");
  });

  it("drops attachments, which carry no text", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "mediaSingle", content: [{ type: "media", attrs: { id: "x" } }] },
        { type: "paragraph", content: [{ type: "text", text: "after" }] },
      ],
    };
    expect(adfToText(doc).trim()).toBe("after");
  });

  it("survives empty, null and unexpected input", () => {
    expect(adfToText(null)).toBe("");
    expect(adfToText(undefined)).toBe("");
    expect(adfToText({})).toBe("");
    expect(adfToText({ type: "somethingNew", content: [{ type: "text", text: "kept" }] })).toBe("kept");
  });

  it("handles a plain string body, as older Jira APIs return", () => {
    expect(adfToText("just text")).toBe("just text");
  });

  it("renders quotes and rules", () => {
    const quote = {
      type: "blockquote",
      content: [{ type: "paragraph", content: [{ type: "text", text: "quoted" }] }],
    };
    expect(adfToText(quote)).toContain("> quoted");
    expect(adfToText({ type: "rule" })).toContain("---");
  });
});

describe("tidy", () => {
  it("collapses runs of blank lines", () => {
    expect(tidy("a\n\n\n\nb", 100)).toBe("a\n\nb");
  });

  it("truncates and says so, to bound context cost", () => {
    const result = tidy("x".repeat(50), 10);
    expect(result).toContain("[truncated]");
    expect(result.length).toBeLessThan(50);
  });
});
