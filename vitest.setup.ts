// Env vars the app validates at import time; tests never touch a real database.
process.env.DATABASE_URL ??= "postgres://test:test@localhost:5432/test";
process.env.SESSION_SECRET ??= "test-session-secret-at-least-32-characters";
process.env.APP_PASSWORD_HASH ??= "0".repeat(128);
process.env.APP_PASSWORD_SALT ??= "test-salt";
