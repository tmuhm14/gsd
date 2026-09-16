import {
  bigint,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Notes and tasks — one row per item, mirroring the macOS app's `Item`.
 *
 * Sync-readiness drives three choices here: the primary key is a client
 * generatable UUID (so the Mac app can push rows it created offline),
 * `updatedAt` is the last-write-wins comparison key, and deletes are
 * tombstoned via `deletedAt` rather than removing the row, so a delete can
 * propagate instead of the row simply reappearing from the other client.
 *
 * No PHI is stored here — this is personal task data, not patient data.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** Cached first line of the body. Derived, never authored directly. */
    title: text("title").notNull().default(""),
    body: text("body").notNull().default(""),
    kind: text("kind").notNull().default("note"),
    bucket: text("bucket").notNull().default("inbox"),
    /** GTD contexts without the leading `@`, parsed out of the body. */
    contexts: text("contexts").array().notNull().default([]),
    projectId: uuid("project_id"),
    dueDate: timestamp("due_date", { withTimezone: true }),
    deferDate: timestamp("defer_date", { withTimezone: true }),
    energy: text("energy"),
    waitingOn: text("waiting_on"),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    /** Tombstone for sync; set instead of deleting the row. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    /**
     * Monotonic write counter, maintained by a database trigger — read-only
     * from the app's point of view. This is the sync cursor; see 002_sync.sql
     * for why it isn't a timestamp.
     */
    serverSeq: bigint("server_seq", { mode: "number" }).notNull().default(0),
  },
  (table) => [
    index("items_bucket_idx").on(table.bucket),
    index("items_updated_at_idx").on(table.updatedAt),
    index("items_project_id_idx").on(table.projectId),
    index("items_server_seq_idx").on(table.serverSeq),
  ],
);

export type ItemRow = typeof items.$inferSelect;
export type NewItemRow = typeof items.$inferInsert;
