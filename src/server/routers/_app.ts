import { router } from "@/server/trpc";
import { itemsRouter } from "@/server/routers/items";
import { aiRouter } from "@/server/routers/ai";

export const appRouter = router({
  items: itemsRouter,
  ai: aiRouter,
});

export type AppRouter = typeof appRouter;
