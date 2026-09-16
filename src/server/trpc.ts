import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { Context } from "@/server/context";

const t = initTRPC.context<Context>().create({
  // Dates survive the wire without hand-rolled serialisation on both sides.
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

/**
 * Every procedure that touches data uses this. Nothing in this app is public
 * beyond signing in, so an unauthenticated call is always a bug or an attack.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.signedIn) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in required" });
  }
  return next({ ctx });
});
