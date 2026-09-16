import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { getSession } from "@/lib/session";
import {
  MAX_PULL_LIMIT,
  pull,
  push,
  type SyncItem,
} from "@/server/sync/service";
import { BUCKETS, ENERGY_LEVELS, ITEM_KINDS } from "@/lib/gtd";

/**
 * Sync endpoint for the macOS client.
 *
 * Plain JSON rather than tRPC: the web UI's tRPC link uses superjson, and a
 * Swift client would have to reimplement that encoding to talk to it. This is
 * a documented cross-stack contract (docs/api/sync.yaml) over the same service
 * functions the rest of the app uses.
 */

const isoDate = z.iso.datetime({ offset: true });

const syncItemSchema = z.object({
  id: z.uuid(),
  body: z.string().max(200_000),
  kind: z.enum(ITEM_KINDS),
  bucket: z.enum(BUCKETS),
  projectId: z.uuid().nullable(),
  dueDate: isoDate.nullable(),
  deferDate: isoDate.nullable(),
  energy: z.enum(ENERGY_LEVELS).nullable(),
  waitingOn: z.string().max(200).nullable(),
  pinned: z.boolean(),
  createdAt: isoDate,
  updatedAt: isoDate,
  completedAt: isoDate.nullable(),
  deletedAt: isoDate.nullable(),
});

const requestSchema = z.object({
  since: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(MAX_PULL_LIMIT).optional(),
  // Push first, then pull, in one round trip.
  changes: z.array(syncItemSchema).max(MAX_PULL_LIMIT).default([]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.signedIn) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid sync request", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { since, limit, changes } = parsed.data;

  // Push before pull so the client's own writes come back with server
  // sequence numbers, and the returned cursor covers them.
  const pushed =
    changes.length > 0
      ? await push(db, changes as SyncItem[])
      : { applied: [], conflicts: [], cursor: 0 };

  const pulled = await pull(db, since, limit);

  return NextResponse.json({
    items: pulled.items,
    cursor: pulled.cursor,
    hasMore: pulled.hasMore,
    applied: pushed.applied,
    conflicts: pushed.conflicts,
  });
}
