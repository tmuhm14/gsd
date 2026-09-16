import { describe, expect, it } from "vitest";
import { generateSalt, hashPassword } from "@/lib/password";

describe("hashPassword", () => {
  it("is deterministic for the same password and salt", () => {
    const salt = "fixed-salt";
    expect(hashPassword("hunter2", salt)).toBe(hashPassword("hunter2", salt));
  });

  it("produces a different hash for a different password", () => {
    const salt = "fixed-salt";
    expect(hashPassword("hunter2", salt)).not.toBe(hashPassword("hunter3", salt));
  });

  it("produces a different hash for the same password under a different salt", () => {
    expect(hashPassword("hunter2", "salt-a")).not.toBe(
      hashPassword("hunter2", "salt-b"),
    );
  });

  it("returns a 64-byte hex digest", () => {
    expect(hashPassword("hunter2", "salt")).toMatch(/^[0-9a-f]{128}$/);
  });
});

describe("generateSalt", () => {
  it("returns a fresh 16-byte hex salt each time", () => {
    const first = generateSalt();
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(first).not.toBe(generateSalt());
  });
});
