import { describe, expect, it } from "vitest";
import {
  activeSlashQuery,
  filterCommands,
  relativeDate,
  SLASH_COMMANDS,
} from "@/lib/slashCommands";

describe("filterCommands", () => {
  it("matches titles and keywords", () => {
    expect(filterCommands("head").map((c) => c.id)).toContain("h1");
    expect(filterCommands("checkbox").map((c) => c.id)).toContain("todo");
    expect(filterCommands("delegate").map((c) => c.id)).toContain("waiting");
  });

  it("returns everything for an empty query and nothing for nonsense", () => {
    expect(filterCommands("")).toHaveLength(SLASH_COMMANDS.length);
    expect(filterCommands("zzzz")).toHaveLength(0);
  });

  it("has unique ids", () => {
    const ids = SLASH_COMMANDS.map((command) => command.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("activeSlashQuery", () => {
  it("detects a slash session at the caret", () => {
    expect(activeSlashQuery("/tod", 4)).toEqual({ start: 0, query: "tod" });
    expect(activeSlashQuery("notes /h1", 9)).toEqual({ start: 6, query: "h1" });
  });

  it("ignores a slash mid-word, so URLs and paths are safe", () => {
    expect(activeSlashQuery("https://example.com", 19)).toBeNull();
    expect(activeSlashQuery("src/lib", 7)).toBeNull();
  });

  it("closes the session once whitespace is typed", () => {
    expect(activeSlashQuery("/todo now", 9)).toBeNull();
  });

  it("returns null when there is no slash at all", () => {
    expect(activeSlashQuery("plain text", 5)).toBeNull();
  });
});

describe("relativeDate", () => {
  it("returns midnight, offset by whole days", () => {
    const from = new Date("2026-03-10T15:30:00");
    const today = relativeDate(0, from);
    expect(today.getHours()).toBe(0);
    expect(today.getDate()).toBe(10);
    expect(relativeDate(1, from).getDate()).toBe(11);
    expect(relativeDate(7, from).getDate()).toBe(17);
  });
});
