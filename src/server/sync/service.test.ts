import { describe, expect, it, vi } from "vitest";
import type { Context } from "@/server/context";
import type { ItemRow } from "@/db/schema/items";
import { pull, push, toWire, type SyncItem } from "@/server/sync/service";

/**
 * An in-memory stand-in for the items table, including the trigger that bumps
 * `server_seq` on every write. Sync correctness is mostly about ordering and
 * which copy wins, and both are visible here.
 */
function makeFakeDb(initial: ItemRow[] = []) {
  const rows = new Map(initial.map((row) => [row.id, { ...row }]));
  let seq = initial.reduce((max, row) => Math.max(max, row.serverSeq), 0);

  const bump = () => (seq += 1);

  const db = {
    select: (projection?: Record<string, unknown>) => {
      const all = () => [...rows.values()];
      const builder = {
        from: () => builder,
        where: (predicate?: unknown) => {
          builder._predicate = predicate;
          return builder;
        },
        orderBy: () => builder,
        limit: (n: number) => Promise.resolve(builder._resolve().slice(0, n)),
        groupBy: () => Promise.resolve(builder._resolve()),
        then: (resolve: (value: unknown[]) => unknown) =>
          Promise.resolve(builder._resolve()).then(resolve),
        _predicate: undefined as unknown,
        _resolve(): unknown[] {
          // The aggregate projection used by currentCursor().
          if (projection && "max" in projection) {
            return [{ max: seq }];
          }
          const predicate = builder._predicate as
            | { kind: "gt"; value: number }
            | { kind: "eq"; value: string }
            | undefined;
          const sorted = all().sort((a, b) => a.serverSeq - b.serverSeq);
          if (predicate?.kind === "gt") {
            return sorted.filter((row) => row.serverSeq > predicate.value);
          }
          if (predicate?.kind === "eq") {
            return sorted.filter((row) => row.id === predicate.value);
          }
          return sorted;
        },
      };
      return builder;
    },
    insert: () => ({
      values: (values: Partial<ItemRow> & { id: string }) => {
        rows.set(values.id, { ...(values as ItemRow), serverSeq: bump() });
        return Promise.resolve();
      },
    }),
    update: () => ({
      set: (values: Partial<ItemRow>) => ({
        where: (predicate: { kind: string; value: string }) => {
          const existing = rows.get(predicate.value);
          if (existing) {
            rows.set(predicate.value, {
              ...existing,
              ...values,
              serverSeq: bump(),
            });
          }
          return Promise.resolve();
        },
      }),
    }),
  };

  return { db: db as unknown as Context["db"], rows };
}

// Drizzle's operators are opaque objects; the fake reads these shapes instead.
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("drizzle-orm")>();
  return {
    ...actual,
    gt: (_column: unknown, value: number) => ({ kind: "gt", value }),
    eq: (_column: unknown, value: string) => ({ kind: "eq", value }),
    asc: () => "asc",
  };
});

function makeRow(overrides: Partial<ItemRow> = {}): ItemRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Note",
    body: "Note\nbody",
    kind: "note",
    bucket: "inbox",
    contexts: [],
    projectId: null,
    dueDate: null,
    deferDate: null,
    energy: null,
    waitingOn: null,
    pinned: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    completedAt: null,
    deletedAt: null,
    serverSeq: 1,
    ...overrides,
  };
}

function wireFrom(row: ItemRow, overrides: Partial<SyncItem> = {}): SyncItem {
  return { ...toWire(row), ...overrides };
}

describe("pull", () => {
  it("returns only rows written after the cursor, oldest first", async () => {
    const { db } = makeFakeDb([
      makeRow({ id: "a".repeat(8) + "-1111-4111-8111-111111111111", serverSeq: 1 }),
      makeRow({ id: "b".repeat(8) + "-1111-4111-8111-111111111111", serverSeq: 5 }),
      makeRow({ id: "c".repeat(8) + "-1111-4111-8111-111111111111", serverSeq: 9 }),
    ]);

    const result = await pull(db, 1);

    expect(result.items).toHaveLength(2);
    expect(result.cursor).toBe(9);
    expect(result.hasMore).toBe(false);
  });

  it("advances the cursor only as far as the page it returned", async () => {
    const { db } = makeFakeDb(
      Array.from({ length: 5 }, (_, index) =>
        makeRow({
          id: `${index}`.repeat(8) + "-1111-4111-8111-111111111111",
          serverSeq: index + 1,
        }),
      ),
    );

    const result = await pull(db, 0, 2);

    expect(result.items).toHaveLength(2);
    expect(result.cursor).toBe(2);
    expect(result.hasMore).toBe(true);
  });

  it("leaves the cursor untouched when there is nothing new", async () => {
    const { db } = makeFakeDb([makeRow({ serverSeq: 4 })]);
    await expect(pull(db, 4)).resolves.toMatchObject({
      items: [],
      cursor: 4,
      hasMore: false,
    });
  });

  it("includes tombstones so deletes propagate", async () => {
    const { db } = makeFakeDb([
      makeRow({ deletedAt: new Date("2026-02-01T00:00:00Z"), serverSeq: 2 }),
    ]);

    const result = await pull(db, 0);
    expect(result.items[0]?.deletedAt).toBe("2026-02-01T00:00:00.000Z");
  });
});

describe("push", () => {
  it("inserts an item the server has never seen", async () => {
    const { db, rows } = makeFakeDb();
    const incoming = wireFrom(makeRow({ body: "From the Mac\nnotes" }));

    const result = await push(db, [incoming]);

    expect(result.applied).toEqual([incoming.id]);
    expect(rows.get(incoming.id)?.body).toBe("From the Mac\nnotes");
  });

  it("derives title and contexts server-side rather than trusting the client", async () => {
    const { db, rows } = makeFakeDb();
    const incoming = wireFrom(makeRow({ body: "Ring @sam about it\nmore" }));

    await push(db, [incoming]);

    expect(rows.get(incoming.id)?.title).toBe("Ring @sam about it");
    expect(rows.get(incoming.id)?.contexts).toEqual(["sam"]);
  });

  it("applies a client change that is newer", async () => {
    const existing = makeRow({ updatedAt: new Date("2026-01-01T00:00:00Z") });
    const { db, rows } = makeFakeDb([existing]);

    const result = await push(db, [
      wireFrom(existing, {
        body: "Newer from the Mac",
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
    ]);

    expect(result.applied).toEqual([existing.id]);
    expect(result.conflicts).toEqual([]);
    expect(rows.get(existing.id)?.body).toBe("Newer from the Mac");
  });

  it("keeps the server copy when it is newer, and reports the conflict", async () => {
    const existing = makeRow({
      body: "Newer on the server",
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    });
    const { db, rows } = makeFakeDb([existing]);

    const result = await push(db, [
      wireFrom(existing, {
        body: "Stale from the Mac",
        updatedAt: "2026-01-01T00:00:00.000Z",
      }),
    ]);

    expect(result.applied).toEqual([]);
    expect(result.conflicts[0]?.body).toBe("Newer on the server");
    expect(rows.get(existing.id)?.body).toBe("Newer on the server");
  });

  it("breaks ties in favour of the server, so replays are stable", async () => {
    const sameMoment = new Date("2026-03-01T00:00:00Z");
    const existing = makeRow({ body: "Server", updatedAt: sameMoment });
    const { db, rows } = makeFakeDb([existing]);

    const result = await push(db, [
      wireFrom(existing, {
        body: "Client",
        updatedAt: sameMoment.toISOString(),
      }),
    ]);

    expect(result.applied).toEqual([]);
    expect(rows.get(existing.id)?.body).toBe("Server");
  });

  it("propagates a delete as a tombstone rather than removing the row", async () => {
    const existing = makeRow({ updatedAt: new Date("2026-01-01T00:00:00Z") });
    const { db, rows } = makeFakeDb([existing]);

    await push(db, [
      wireFrom(existing, {
        updatedAt: "2026-06-01T00:00:00.000Z",
        deletedAt: "2026-06-01T00:00:00.000Z",
      }),
    ]);

    expect(rows.has(existing.id)).toBe(true);
    expect(rows.get(existing.id)?.deletedAt).toBeInstanceOf(Date);
  });

  it("bumps the sequence on every applied write so the row is pullable", async () => {
    const { db } = makeFakeDb([makeRow({ serverSeq: 7 })]);
    const fresh = makeRow({
      id: "22222222-2222-4222-8222-222222222222",
      serverSeq: 0,
    });

    await push(db, [wireFrom(fresh)]);
    const result = await pull(db, 7);

    expect(result.items.map((item) => item.id)).toEqual([fresh.id]);
  });

  it("handles an empty batch", async () => {
    const { db } = makeFakeDb();
    await expect(push(db, [])).resolves.toMatchObject({
      applied: [],
      conflicts: [],
    });
  });
});
