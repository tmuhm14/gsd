import { afterEach, describe, expect, it, vi } from "vitest";
import { extractIssueKeys, fetchIssue, isConfigured, JiraError } from "@/server/jira/client";

describe("extractIssueKeys", () => {
  it("finds keys in prose", () => {
    expect(extractIssueKeys("Fix WH-1234 before the WH-99 release")).toEqual([
      "WH-1234",
      "WH-99",
    ]);
  });

  it("deduplicates and caps", () => {
    expect(extractIssueKeys("WH-1 WH-1 WH-2")).toEqual(["WH-1", "WH-2"]);
    expect(extractIssueKeys("AA-1 BB-2 CC-3 DD-4 EE-5 FF-6", 3)).toHaveLength(3);
  });

  it("requires at least two characters in the project key, as Jira does", () => {
    expect(extractIssueKeys("A-1")).toEqual([]);
    expect(extractIssueKeys("AA-1")).toEqual(["AA-1"]);
  });

  it("does not carry regex state between calls", () => {
    // A module-level /g/ regex would make the second call miss.
    expect(extractIssueKeys("WH-1234")).toEqual(["WH-1234"]);
    expect(extractIssueKeys("WH-1234")).toEqual(["WH-1234"]);
  });

  it("ignores things that only look like keys", () => {
    // Lowercase, no digits, or embedded in a word.
    expect(extractIssueKeys("wh-1234")).toEqual([]);
    expect(extractIssueKeys("COVID-19-related")).toEqual(["COVID-19"]);
    expect(extractIssueKeys("no keys here")).toEqual([]);
  });
});

describe("isConfigured", () => {
  it("is false without credentials, so the tool is never offered", () => {
    // vitest.setup.ts leaves the Jira vars unset.
    expect(isConfigured()).toBe(false);
  });
});

describe("fetchIssue", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("refuses a malformed key before making a request", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(fetchIssue("not a key")).rejects.toThrow(JiraError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("fails clearly when Jira is not configured", async () => {
    await expect(fetchIssue("WH-1234")).rejects.toThrow(/not configured/i);
  });
});
