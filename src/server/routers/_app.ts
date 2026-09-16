import { router } from "@/server/trpc";
import { itemsRouter } from "@/server/routers/items";

export const appRouter = router({
  items: itemsRouter,
});

export type AppRouter = typeof appRouter;
