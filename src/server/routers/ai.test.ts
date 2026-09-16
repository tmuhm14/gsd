import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Context } from "@/server/context";
import type { ItemRow } from "@/db/schema/items";

// The Claude layer is mocked: these tests cover the router's guards, not the
// model. Nothing here should ever reach the network.
const runClarify = vi.fn();
const runBreakdown = vi.fn();
const runResearch = vi.fn();
const runSummarize = vi.fn();
const isConfigured = vi.fn(() => true);

vi.mock("@/server/ai/claude", () => ({
  runClarify: (...args: unknown[]) => runClarify(...args),
  runBreakdown: (...args: unknown[]) => runBreakdown(...args),
  runResearch: (...args: unknown[]) => runResearch(...args),
  runSummarize: (...args: unknown[]) => runSummarize(...args),
  isConfigured: () => isConfigured(),
}));

const { appRouter } = await import("@/server/routers/_app");

const sampleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Fix the fax retry bug",
  body: "Fix the fax retry bug\nit drops on 500s",
  kind: "action",
  bucket: "next",
  contexts: [],
  projectId: null,
  dueDate: null,
  deferDate: null,
  energy: null,
  waitingOn: null,
  pinned: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  completedAt: null,
  deletedAt: null,
  serverSeq: 1,
} satisfies ItemRow;

function makeDb(rows: unknown[]) {
  const chain = {
    from: () => chain,
    where: () => chain,
    limit: () => Promise.resolve(rows),
    orderBy: () => Promise.resolve(rows),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(rows).then(resolve),
  };
  return { select: () => chain } as unknown as Context["db"];
}

function caller(rows: unknown[], signedIn = true) {
  return appRouter.createCaller({ db: makeDb(rows), signedIn } as Context);
}

beforeEach(() => {
  vi.clearAllMocks();
  isConfigured.mockReturnValue(true);
  runClarify.mockResolvedValue({
    action: "clarify",
    bucket: "next",
    kind: "action",
    contexts: [],
    nextAction: "Do it",
    rationale: "x",
  });
});

describe("authorisation", () => {
  it("refuses to run for a signed-out caller", async () => {
    await expect(
      caller([sampleRow], false).ai.run({ id: sampleRow.id, action: "clarify" }),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED" });

    expect(runClarify).not.toHaveBeenCalled();
  });

  it("does not spend a model call before the auth check", async () => {
    await expect(
      caller([sampleRow], false).ai.run({ id: sampleRow.id, action: "research" }),
    ).rejects.toThrow();

    expect(runResearch).not.toHaveBeenCalled();
  });
});

describe("guards", () => {
  it("404s for an item that does not exist", async () => {
    await expect(
      caller([]).ai.run({ id: sampleRow.id, action: "clarify" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(runClarify).not.toHaveBeenCalled();
  });

  it("refuses an empty note rather than paying for a call on nothing", async () => {
    await expect(
      caller([{ ...sampleRow, body: "   \n " }]).ai.run({
        id: sampleRow.id,
        action: "clarify",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(runClarify).not.toHaveBeenCalled();
  });

  it("rejects an unknown action", async () => {
    await expect(
      // @ts-expect-error not a real action
      caller([sampleRow]).ai.run({ id: sampleRow.id, action: "hallucinate" }),
    ).rejects.toThrow();
  });
});

describe("dispatch", () => {
  it("routes each action to its handler, passing the note body", async () => {
    runBreakdown.mockResolvedValue({ action: "breakdown", actions: ["a"] });
    runResearch.mockResolvedValue({ action: "research", markdown: "m", sources: [] });
    runSummarize.mockResolvedValue({ action: "summarize", summary: "s" });

    const api = caller([sampleRow]);
    await api.ai.run({ id: sampleRow.id, action: "clarify" });
    await api.ai.run({ id: sampleRow.id, action: "breakdown" });
    await api.ai.run({ id: sampleRow.id, action: "research" });
    await api.ai.run({ id: sampleRow.id, action: "summarize" });

    expect(runClarify).toHaveBeenCalledWith(sampleRow.body);
    expect(runBreakdown).toHaveBeenCalledWith(sampleRow.body);
    expect(runResearch).toHaveBeenCalledWith(sampleRow.body);
    expect(runSummarize).toHaveBeenCalledWith(sampleRow.body);
  });

  it("returns the proposal unchanged", async () => {
    await expect(
      caller([sampleRow]).ai.run({ id: sampleRow.id, action: "clarify" }),
    ).resolves.toMatchObject({ action: "clarify", nextAction: "Do it" });
  });
});

describe("status", () => {
  it("reports whether a key is configured", async () => {
    await expect(caller([]).ai.status()).resolves.toEqual({ configured: true });

    isConfigured.mockReturnValue(false);
    await expect(caller([]).ai.status()).resolves.toEqual({ configured: false });
  });
});
