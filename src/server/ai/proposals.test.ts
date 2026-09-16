import { describe, expect, it } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import {
  breakdownSchema,
  clarifySchema,
  summarizeSchema,
} from "@/server/ai/proposals";

/**
 * Regression cover for a 400 the macOS client hit:
 * "output_config.format.schema: For 'array' type, property 'maxItems' is not supported".
 */
const schemas = [
  ["clarify", clarifySchema],
  ["breakdown", breakdownSchema],
  ["summarize", summarizeSchema],
] as const;

function collectKeys(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, found);
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      found.add(key);
      collectKeys(child, found);
    }
  }
  return found;
}

describe("structured output schemas", () => {
  const rejected = ["minItems", "maxItems", "minLength", "maxLength", "minimum", "maximum"];

  it.each(schemas)("%s emits no unsupported keywords", (_name, schema) => {
    const emitted = zodOutputFormat(schema);
    const keys = collectKeys(emitted.schema);
    for (const keyword of rejected) {
      expect(keys.has(keyword)).toBe(false);
    }
  });

  it.each(schemas)("%s is a strict object", (_name, schema) => {
    const emitted = zodOutputFormat(schema) as unknown as {
      schema: { type: string; additionalProperties: boolean; required: string[] };
    };
    expect(emitted.schema.type).toBe("object");
    expect(emitted.schema.additionalProperties).toBe(false);
    expect(emitted.schema.required.length).toBeGreaterThan(0);
  });

  it("accepts a reply with more contexts than the soft limit", () => {
    // The model overshooting must not fail the parse — the caller trims.
    const parsed = clarifySchema.safeParse({
      bucket: "next",
      kind: "action",
      contexts: ["a", "b", "c", "d", "e", "f", "g"],
      nextAction: "Do it",
      rationale: "x",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts an empty action list rather than throwing at parse time", () => {
    expect(breakdownSchema.safeParse({ actions: [] }).success).toBe(true);
  });

  it("still rejects a genuinely wrong shape", () => {
    expect(
      clarifySchema.safeParse({ bucket: "not-a-bucket", kind: "action", contexts: [], nextAction: "", rationale: "" })
        .success,
    ).toBe(false);
  });
});
