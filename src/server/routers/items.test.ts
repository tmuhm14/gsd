import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";
import { appRouter } from "@/server/routers/_app";
import type { Context } from "@/server/context";
import type { ItemRow } from "@/db/schema/items";

/**
 * A stand-in for Drizzle's query builder. Records what the router asked for and
 * replays a canned result, so these tests cover the router's own decisions —
 * derived fields, completion stamps, not-found handling — without a database.
 */
function makeDb(result: unknown[] = []) {
  const calls = { insertValues: null as unknown, updateSet: null as unknown };

  // Drizzle's builder is thenable, so awaiting it mid-chain runs the query.
  // The stub must be too, or procedures that skip orderBy receive the builder.
  const selectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => Promise.resolve(result),
    groupBy: () => Promise.resolve(result),
    limit: () => Promise.resolve(result),
    then: (resolve: (value: unknown[]) => unknown) =>
      Promise.resolve(result).then(resolve),
  };

  const db = {
    select: () => selectChain,
    insert: () => ({
      values: (values: unknown) => {
        calls.insertValues = values;
        return { returning: () => Promise.resolve(result) };
      },
    }),
    update: () => ({
      set: (values: unknown) => {
        calls.updateSet = values;
        return {
          where: () => ({ returning: () => Promise.resolve(result) }),
        };
      },
    }),
  };

  return { db: db as unknown as Context["db"], calls };
}

function caller(db: Context["db"], signedIn = true) {
  return appRouter.createCaller({ db, signedIn } as Context);
}

const sampleRow = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Call the dentist",
  body: "Call the dentist\n- [ ] find the number",
  kind: "action",
  bucket: "next",
  contexts: ["calls"],
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

describe("auth", () => {
  it("rejects every data procedure when signed out", async () => {
    const { db } = makeDb([]);
    const api = caller(db, false);

    await expect(api.items.list({})).rejects.toThrow(TRPCError);
    await expect(api.items.create({ body: "x" })).rejects.toThrow(TRPCError);
    await expect(
      api.items.trash({ id: sampleRow.id }),
    ).rejects.toThrow(TRPCError);
  });

  it("reports unauthorized rather than leaking a reason", async () => {
    const { db } = makeDb([]);
    await expect(caller(db, false).items.counts()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });
});

describe("create", () => {
  it("derives the title and contexts from the body", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.create({ body: "Ring @sam about @billing\nmore" });

    expect(calls.insertValues).toMatchObject({
      title: "Ring @sam about @billing",
      contexts: ["sam", "billing"],
    });
  });

  it("accepts an empty body and stores an empty title", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.create({});

    expect(calls.insertValues).toMatchObject({ body: "", title: "" });
  });

  it("never lets a client set the title directly", async () => {
    const { db } = makeDb([sampleRow]);
    // @ts-expect-error title is derived server-side and not part of the input.
    await caller(db).items.create({ body: "a", title: "spoofed" });
  });
});

describe("update", () => {
  it("re-derives title and contexts when the body changes", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.update({ id: sampleRow.id, body: "New @home title" });

    expect(calls.updateSet).toMatchObject({
      title: "New @home title",
      contexts: ["home"],
    });
  });

  it("leaves the title alone when only metadata changes", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.update({ id: sampleRow.id, pinned: true });

    expect(calls.updateSet).not.toHaveProperty("title");
    expect(calls.updateSet).toMatchObject({ pinned: true });
  });

  it("stamps completedAt when moved to done", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.update({ id: sampleRow.id, bucket: "done" });

    expect((calls.updateSet as { completedAt: Date }).completedAt).toBeInstanceOf(Date);
  });

  it("clears completedAt when reopened", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.update({ id: sampleRow.id, bucket: "next" });

    expect(calls.updateSet).toMatchObject({ completedAt: null });
  });

  it("throws NOT_FOUND when nothing was updated", async () => {
    const { db } = makeDb([]);
    await expect(
      caller(db).items.update({ id: sampleRow.id, pinned: true }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid bucket", async () => {
    const { db } = makeDb([sampleRow]);
    await expect(
      // @ts-expect-error not a real bucket
      caller(db).items.update({ id: sampleRow.id, bucket: "someday-maybe" }),
    ).rejects.toThrow();
  });

  it("rejects a malformed id", async () => {
    const { db } = makeDb([sampleRow]);
    await expect(
      caller(db).items.update({ id: "not-a-uuid", pinned: true }),
    ).rejects.toThrow();
  });
});

describe("deletes", () => {
  it("trash is a bucket move, not a row removal", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.trash({ id: sampleRow.id });

    expect(calls.updateSet).toMatchObject({ bucket: "trash" });
    expect(calls.updateSet).not.toHaveProperty("deletedAt");
  });

  it("destroy tombstones the row so the delete can sync", async () => {
    const { db, calls } = makeDb([sampleRow]);
    await caller(db).items.destroy({ id: sampleRow.id });

    expect((calls.updateSet as { deletedAt: Date }).deletedAt).toBeInstanceOf(Date);
  });

  it("emptyTrash reports how many it cleared", async () => {
    const { db } = makeDb([{ id: sampleRow.id }, { id: sampleRow.id }]);
    await expect(caller(db).items.emptyTrash()).resolves.toEqual({ count: 2 });
  });

  it("byId throws NOT_FOUND for a missing item", async () => {
    const { db } = makeDb([]);
    await expect(
      caller(db).items.byId({ id: sampleRow.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("counts", () => {
  it("shapes rows into a bucket map", async () => {
    const { db } = makeDb([
      { bucket: "inbox", count: 3 },
      { bucket: "next", count: 1 },
    ]);
    await expect(caller(db).items.counts()).resolves.toEqual({
      inbox: 3,
      next: 1,
    });
  });
});

describe("contexts", () => {
  it("deduplicates and sorts", async () => {
    const { db } = makeDb([
      { context: "mac" },
      { context: "calls" },
      { context: "mac" },
    ]);
    await expect(caller(db).items.contexts()).resolves.toEqual(["calls", "mac"]);
  });
});
