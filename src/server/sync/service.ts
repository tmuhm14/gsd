import { asc, eq, gt, sql } from "drizzle-orm";
import { items, type ItemRow } from "@/db/schema/items";
import { deriveTitle, parseContexts } from "@/lib/markdown";
import type { Context } from "@/server/context";

/**
 * Delta sync between the macOS app and this database.
 *
 * Two rules do the work:
 *
 * 1. **Last write wins, per item, by `updatedAt`.** Field-level merging would
 *    need per-field timestamps and still guess wrong; for one user on two
 *    devices, whole-item LWW is predictable and explainable.
 * 2. **The cursor is `serverSeq`, never a timestamp.** Client clocks disagree;
 *    the sequence is assigned by the database and only moves forward, so a
 *    pull cannot skip a row that landed during the previous request.
 *
 * Deletes are tombstones. A hard delete would simply be re-created by the
 * other client on its next push.
 */

/** Wire shape. Dates are ISO-8601 strings — this contract is consumed by Swift. */
export type SyncItem = {
  id: string;
  body: string;
  kind: string;
  bucket: string;
  projectId: string | null;
  dueDate: string | null;
  deferDate: string | null;
  energy: string | null;
  waitingOn: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  deletedAt: string | null;
};

export type PullResult = {
  items: SyncItem[];
  cursor: number;
  hasMore: boolean;
};

export type PushResult = {
  applied: string[];
  /** Rows where the server copy was newer; the client should adopt these. */
  conflicts: SyncItem[];
  cursor: number;
};

export const MAX_PULL_LIMIT = 500;

export function toWire(row: ItemRow): SyncItem {
  return {
    id: row.id,
    body: row.body,
    kind: row.kind,
    bucket: row.bucket,
    projectId: row.projectId,
    dueDate: row.dueDate?.toISOString() ?? null,
    deferDate: row.deferDate?.toISOString() ?? null,
    energy: row.energy,
    waitingOn: row.waitingOn,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    deletedAt: row.deletedAt?.toISOString() ?? null,
  };
}

/** Everything written after `since`, oldest first, capped at `limit`. */
export async function pull(
  db: Context["db"],
  since: number,
  limit: number = MAX_PULL_LIMIT,
): Promise<PullResult> {
  const capped = Math.min(Math.max(limit, 1), MAX_PULL_LIMIT);

  // One extra row tells us whether another page is waiting, without a count.
  const rows = await db
    .select()
    .from(items)
    .where(gt(items.serverSeq, since))
    .orderBy(asc(items.serverSeq))
    .limit(capped + 1);

  const hasMore = rows.length > capped;
  const page = hasMore ? rows.slice(0, capped) : rows;

  return {
    items: page.map(toWire),
    // Advance only as far as we actually returned, so nothing is skipped.
    cursor: page.at(-1)?.serverSeq ?? since,
    hasMore,
  };
}

/**
 * Applies client changes, keeping whichever copy of each item is newer.
 *
 * Items are handled one at a time on purpose: one bad row shouldn't reject a
 * whole batch and wedge the client into retrying it forever.
 */
export async function push(
  db: Context["db"],
  incoming: SyncItem[],
): Promise<PushResult> {
  const applied: string[] = [];
  const conflicts: SyncItem[] = [];

  for (const item of incoming) {
    const [existing] = await db
      .select()
      .from(items)
      .where(eq(items.id, item.id))
      .limit(1);

    const incomingUpdatedAt = new Date(item.updatedAt);

    if (existing) {
      // Ties go to the server: re-applying an identical write is pointless,
      // and it keeps the outcome stable however the batch is ordered.
      if (existing.updatedAt >= incomingUpdatedAt) {
        conflicts.push(toWire(existing));
        continue;
      }

      await db
        .update(items)
        .set({ ...toColumns(item), updatedAt: incomingUpdatedAt })
        .where(eq(items.id, item.id));
      applied.push(item.id);
      continue;
    }

    await db.insert(items).values({
      id: item.id,
      ...toColumns(item),
      createdAt: new Date(item.createdAt),
      updatedAt: incomingUpdatedAt,
    });
    applied.push(item.id);
  }

  return { applied, conflicts, cursor: await currentCursor(db) };
}

/** Title and contexts stay derived server-side, exactly as in the items router. */
function toColumns(item: SyncItem) {
  return {
    body: item.body,
    title: deriveTitle(item.body),
    contexts: parseContexts(item.body),
    kind: item.kind,
    bucket: item.bucket,
    projectId: item.projectId,
    dueDate: item.dueDate ? new Date(item.dueDate) : null,
    deferDate: item.deferDate ? new Date(item.deferDate) : null,
    energy: item.energy,
    waitingOn: item.waitingOn,
    pinned: item.pinned,
    completedAt: item.completedAt ? new Date(item.completedAt) : null,
    deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
  };
}

export async function currentCursor(db: Context["db"]): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${items.serverSeq}), 0)::int` })
    .from(items);
  return row?.max ?? 0;
}
