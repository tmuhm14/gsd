import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { items } from "@/db/schema/items";
import { protectedProcedure, router } from "@/server/trpc";
import { BUCKETS, ENERGY_LEVELS, ITEM_KINDS } from "@/lib/gtd";
import { deriveTitle, parseContexts } from "@/lib/markdown";

const bucketSchema = z.enum(BUCKETS);
const kindSchema = z.enum(ITEM_KINDS);
const energySchema = z.enum(ENERGY_LEVELS);

/** Fields a client may set. `title` and `contexts` are derived, never sent. */
const itemInput = z.object({
  body: z.string().max(200_000).optional(),
  kind: kindSchema.optional(),
  bucket: bucketSchema.optional(),
  projectId: z.uuid().nullable().optional(),
  dueDate: z.date().nullable().optional(),
  deferDate: z.date().nullable().optional(),
  energy: energySchema.nullable().optional(),
  waitingOn: z.string().max(200).nullable().optional(),
  pinned: z.boolean().optional(),
});

/** Live rows only — tombstoned deletes stay in the table for sync. */
const alive = isNull(items.deletedAt);

/** Pinned first, then nearest due date, then most recently touched. */
const defaultOrder = [
  desc(items.pinned),
  sql`${items.dueDate} asc nulls last`,
  desc(items.updatedAt),
];

export const itemsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        bucket: bucketSchema.optional(),
        projectId: z.uuid().optional(),
        context: z.string().optional(),
        search: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const filters = [alive];

      if (input.bucket) filters.push(eq(items.bucket, input.bucket));
      if (input.projectId) filters.push(eq(items.projectId, input.projectId));
      if (input.context) {
        filters.push(sql`${input.context} = ANY(${items.contexts})`);
      }
      if (input.search?.trim()) {
        const pattern = `%${input.search.trim()}%`;
        const matches = or(
          sql`${items.title} ILIKE ${pattern}`,
          sql`${items.body} ILIKE ${pattern}`,
        );
        if (matches) filters.push(matches);
      }

      return ctx.db
        .select()
        .from(items)
        .where(and(...filters))
        .orderBy(...defaultOrder);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), alive))
        .limit(1);

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      return item;
    }),

  /** Counts for the sidebar, in one round trip rather than one query per bucket. */
  counts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ bucket: items.bucket, count: sql<number>`count(*)::int` })
      .from(items)
      .where(alive)
      .groupBy(items.bucket);

    return Object.fromEntries(rows.map((row) => [row.bucket, row.count]));
  }),

  contexts: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({ context: sql<string>`unnest(${items.contexts})` })
      .from(items)
      .where(and(alive, sql`${items.bucket} <> 'trash'`));

    return [...new Set(rows.map((row) => row.context))].sort();
  }),

  projects: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(items)
      .where(
        and(alive, eq(items.kind, "project"), sql`${items.bucket} <> 'trash'`),
      )
      .orderBy(...defaultOrder);
  }),

  create: protectedProcedure
    .input(itemInput)
    .mutation(async ({ ctx, input }) => {
      const body = input.body ?? "";
      const [created] = await ctx.db
        .insert(items)
        .values({
          ...input,
          body,
          title: deriveTitle(body),
          contexts: parseContexts(body),
        })
        .returning();

      if (!created) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Could not create item",
        });
      }
      return created;
    }),

  update: protectedProcedure
    .input(itemInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...changes } = input;

      // Completion is a consequence of the bucket, not a separate field to set.
      const completedAt =
        changes.bucket === undefined
          ? undefined
          : changes.bucket === "done"
            ? new Date()
            : null;

      const [updated] = await ctx.db
        .update(items)
        .set({
          ...changes,
          ...(changes.body === undefined
            ? {}
            : {
                title: deriveTitle(changes.body),
                contexts: parseContexts(changes.body),
              }),
          ...(completedAt === undefined ? {} : { completedAt }),
          updatedAt: new Date(),
        })
        .where(and(eq(items.id, id), alive))
        .returning();

      if (!updated) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      return updated;
    }),

  /** Soft delete: moves to the trash bucket, recoverable. */
  trash: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [trashed] = await ctx.db
        .update(items)
        .set({ bucket: "trash", updatedAt: new Date() })
        .where(and(eq(items.id, input.id), alive))
        .returning();

      if (!trashed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      return trashed;
    }),

  /** Tombstones the row so the delete can propagate to other clients. */
  destroy: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const [destroyed] = await ctx.db
        .update(items)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(items.id, input.id), alive))
        .returning();

      if (!destroyed) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }
      return { id: destroyed.id };
    }),

  emptyTrash: protectedProcedure.mutation(async ({ ctx }) => {
    const now = new Date();
    const cleared = await ctx.db
      .update(items)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(alive, eq(items.bucket, "trash")))
      .returning({ id: items.id });

    return { count: cleared.length };
  }),
});
