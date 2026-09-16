/**
 * Generates the APP_PASSWORD_SALT / APP_PASSWORD_HASH pair for .env.
 * Usage: pnpm tsx scripts/hash-password.ts "your-password"
 */
import { randomBytes, scryptSync } from "node:crypto";

const password = process.argv[2];
if (!password) {
  console.error('Usage: pnpm tsx scripts/hash-password.ts "your-password"');
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const hash = scryptSync(password, salt, 64).toString("hex");

console.log(`APP_PASSWORD_SALT="${salt}"`);
console.log(`APP_PASSWORD_HASH="${hash}"`);
console.log(`\nSESSION_SECRET="${randomBytes(32).toString("base64")}"`);
