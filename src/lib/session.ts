import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/env";

export type Session = {
  signedIn?: boolean;
};

/**
 * Session config only — deliberately free of `node:crypto` so the Edge
 * middleware can import it. Password hashing lives in `password.ts`, which is
 * Node-only and must never be pulled into middleware.
 */
export const sessionOptions: SessionOptions = {
  password: env.SESSION_SECRET,
  cookieName: "task_notes_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  },
};

export async function getSession() {
  return getIronSession<Session>(await cookies(), sessionOptions);
}
