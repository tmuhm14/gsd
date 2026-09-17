import { z } from "zod";

/// Env vars are validated once, at import, so a misconfigured deploy fails
/// immediately and loudly rather than at the first database call.
const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters"),
  APP_PASSWORD_SALT: z.string().min(1, "APP_PASSWORD_SALT is required"),
  APP_PASSWORD_HASH: z.string().min(1, "APP_PASSWORD_HASH is required"),
  // Optional: the app runs fine without it, and only the AI routes fail —
  // a missing key shouldn't stop you reading your notes.
  ANTHROPIC_API_KEY: z.string().optional(),
  // Optional: enables the Jira lookup tool. Without these the AI actions run
  // exactly as before, minus that tool.
  JIRA_BASE_URL: z.string().url().optional(),
  JIRA_EMAIL: z.string().email().optional(),
  JIRA_API_TOKEN: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Invalid environment configuration:\n${issues}`);
}

export const env = parsed.data;
