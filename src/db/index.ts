import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { env } from "@/env";
import { items } from "@/db/schema/items";

export const schema = { items };

/**
 * One client per process. Neon's HTTP driver suits Vercel's serverless
 * functions: no connection pool to exhaust across cold starts.
 */
export const db = drizzle(neon(env.DATABASE_URL), { schema });
