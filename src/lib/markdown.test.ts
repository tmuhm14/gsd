import { describe, expect, it } from "vitest";
import {
  classify,
  deriveTitle,
  indentLevel,
  parseContexts,
  snippet,
  stripPrefix,
  todoCounts,
  toggleTodo,
  toggleTodoAtLine,
  applyMarker,
} from "@/lib/markdown";

describe("classify", () => {
  it("recognises every block kind", () => {
    expect(classify("# Title").kind).toEqual({ type: "heading", level: 1 });
    expect(classify("### Small").kind).toEqual({ type: "heading", level: 3 });
    expect(classify("#### Too deep").kind).toEqual({ type: "paragraph" });
    expect(classify("#NoSpace").kind).toEqual({ type: "paragraph" });
    expect(classify("- bullet").kind).toEqual({ type: "bullet" });
    expect(classify("- [ ] open").kind).toEqual({ type: "todo", done: false });
    expect(classify("- [x] done").kind).toEqual({ type: "todo", done: true });
    expect(classify("3. third").kind).toEqual({ type: "numbered", start: 3 });
    expect(classify("> quote").kind).toEqual({ type: "quote" });
    expect(classify("---").kind).toEqual({ type: "divider" });
    expect(classify("```ts").kind).toEqual({ type: "code" });
    expect(classify("").kind).toEqual({ type: "paragraph" });
  });

  it("counts indentation into the prefix", () => {
    expect(classify("  - [ ] nested")).toEqual({
      kind: { type: "todo", done: false },
      prefixLength: 8,
    });
    expect(stripPrefix("  - [ ] nested")).toBe("nested");
    expect(indentLevel("    - deep")).toBe(2);
  });
});

describe("toggleTodo", () => {
  it("round trips", () => {
    expect(toggleTodo("- [ ] task")).toBe("- [x] task");
    expect(toggleTodo("- [x] task")).toBe("- [ ] task");
  });

  it("promotes a plain line, keeping indentation", () => {
    expect(toggleTodo("  plain")).toBe("  - [ ] plain");
    expect(toggleTodo("- bullet")).toBe("- [ ] bullet");
  });

  it("toggles one line inside a document", () => {
    const body = "Title\n- [ ] a\n- [ ] b";
    expect(toggleTodoAtLine(body, 2)).toBe("Title\n- [ ] a\n- [x] b");
  });

  it("leaves the document alone when the line is out of range", () => {
    const body = "Title";
    expect(toggleTodoAtLine(body, 9)).toBe(body);
  });
});

describe("applyMarker", () => {
  it("replaces whatever marker is there", () => {
    expect(applyMarker("# ", "- [ ] thing")).toBe("# thing");
    expect(applyMarker("", "## heading")).toBe("heading");
    expect(applyMarker("- ", "  > quoted")).toBe("  - quoted");
  });
});

describe("titles", () => {
  it("takes the first line, without its marker", () => {
    expect(deriveTitle("Call the dentist\nnotes")).toBe("Call the dentist");
    expect(deriveTitle("# Project plan\nnotes")).toBe("Project plan");
    expect(deriveTitle("- [ ] Ship it")).toBe("Ship it");
    expect(deriveTitle("")).toBe("");
  });

  it("previews the lines after the title", () => {
    expect(snippet("Title\n- [ ] first\n- [ ] second")).toBe("first · second");
    expect(snippet("Title")).toBe("");
  });
});

describe("parseContexts", () => {
  it("finds tags at word starts", () => {
    expect(parseContexts("Call Sam @calls then @mac work")).toEqual([
      "calls",
      "mac",
    ]);
  });

  it("ignores email addresses", () => {
    expect(parseContexts("email tony@example.com")).toEqual([]);
  });

  it("deduplicates case-insensitively", () => {
    expect(parseContexts("@Mac @mac @MAC")).toEqual(["mac"]);
  });

  it("ignores a bare @", () => {
    expect(parseContexts("just an @ sign")).toEqual([]);
  });
});

describe("todoCounts", () => {
  it("counts open and done", () => {
    expect(todoCounts("# Plan\n- [ ] a\n- [x] b\n- [ ] c\nnotes")).toEqual({
      open: 2,
      done: 1,
    });
  });
});
