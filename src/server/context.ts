import { getSession } from "@/lib/session";
import { db } from "@/db";

export async function createContext() {
  const session = await getSession();
  return { db, signedIn: session.signedIn === true };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
