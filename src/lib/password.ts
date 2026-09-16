import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { env } from "@/env";

/**
 * Single-user auth: one password, checked against a scrypt hash held in the
 * environment. There is no users table because there is exactly one user; if
 * this ever grows real accounts, this module and `session.ts` are the seam.
 *
 * Node-only — importing this from Edge middleware breaks the build.
 */
const KEY_LENGTH = 64;

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, KEY_LENGTH).toString("hex");
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Constant-time, so a wrong guess can't be timed character by character. */
export function verifyPassword(password: string): boolean {
  const attempt = Buffer.from(
    hashPassword(password, env.APP_PASSWORD_SALT),
    "hex",
  );
  const expected = Buffer.from(env.APP_PASSWORD_HASH, "hex");
  if (attempt.length !== expected.length) return false;
  return timingSafeEqual(attempt, expected);
}
