import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { items } from "@/db/schema/items";
import { protectedProcedure, router } from "@/server/trpc";
import { AI_ACTIONS } from "@/server/ai/proposals";
import {
  isConfigured,
  runBreakdown,
  runClarify,
  runResearch,
  runSummarize,
} from "@/server/ai/claude";

/**
 * Read-only by design: every procedure here loads an item and returns a
 * proposal. Applying a proposal goes through `items.update` like any other
 * edit, so there is exactly one write path and the user is always the one who
 * commits the change.
 */
export const aiRouter = router({
  status: protectedProcedure.query(() => ({ configured: isConfigured() })),

  run: protectedProcedure
    .input(z.object({ id: z.uuid(), action: z.enum(AI_ACTIONS) }))
    .mutation(async ({ ctx, input }) => {
      const [item] = await ctx.db
        .select()
        .from(items)
        .where(and(eq(items.id, input.id), isNull(items.deletedAt)))
        .limit(1);

      if (!item) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Item not found" });
      }

      if (item.body.trim().length === 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Write something in the note first.",
        });
      }

      switch (input.action) {
        case "clarify":
          return runClarify(item.body);
        case "breakdown":
          return runBreakdown(item.body);
        case "research":
          return runResearch(item.body);
        case "summarize":
          return runSummarize(item.body);
      }
    }),
});
