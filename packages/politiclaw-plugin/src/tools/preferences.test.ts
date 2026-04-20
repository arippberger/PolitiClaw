import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  setStorageForTests,
  resetStorageConfigForTests,
} from "../storage/context.js";
import {
  deleteIssueStanceTool,
  getPreferencesTool,
  listIssueStancesTool,
  recordStanceSignalTool,
  setIssueStanceTool,
  setPreferencesTool,
  listStanceSignals,
} from "./preferences.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("set_preferences tool", () => {
  it("persists input and returns confirmation text", async () => {
    const db = withMemoryStorage();
    const result = await setPreferencesTool.execute!(
      "call-1",
      { address: "123 Main", state: "ca", zip: "94110" },
      undefined,
      undefined,
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
    const row = db.prepare("SELECT address, state FROM preferences WHERE id=1").get() as {
      address: string;
      state: string;
    };
    expect(row.address).toBe("123 Main");
    expect(row.state).toBe("CA");
  });

  it("rejects empty address", async () => {
    withMemoryStorage();
    await expect(
      setPreferencesTool.execute!("call-1", { address: "" }, undefined, undefined),
    ).rejects.toThrow();
  });
});

describe("get_preferences tool", () => {
  it("returns null details before any preferences are set", async () => {
    withMemoryStorage();
    const result = await getPreferencesTool.execute!("call-1", {}, undefined, undefined);
    expect(result.details).toEqual({ preferences: null });
  });

  it("returns persisted preferences", async () => {
    withMemoryStorage();
    await setPreferencesTool.execute!(
      "call-1",
      { address: "123 Main", state: "ca" },
      undefined,
      undefined,
    );
    const result = await getPreferencesTool.execute!("call-2", {}, undefined, undefined);
    expect((result.details as { preferences: { address: string } }).preferences.address).toBe(
      "123 Main",
    );
  });
});

describe("set_issue_stance tool", () => {
  it("normalizes the issue slug and persists the row", async () => {
    const db = withMemoryStorage();
    const result = await setIssueStanceTool.execute!(
      "call-1",
      { issue: "Affordable Housing", stance: "support", weight: 4 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("affordable-housing");
    expect(text).toContain("weight 4");
    const rows = db
      .prepare("SELECT issue, stance, weight FROM issue_stances")
      .all() as Array<{ issue: string; stance: string; weight: number }>;
    expect(rows).toEqual([{ issue: "affordable-housing", stance: "support", weight: 4 }]);
  });

  it("overwrites on repeated set with the same issue", async () => {
    const db = withMemoryStorage();
    await setIssueStanceTool.execute!(
      "call-1",
      { issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    await setIssueStanceTool.execute!(
      "call-2",
      { issue: "climate", stance: "oppose", weight: 2 },
      undefined,
      undefined,
    );
    const rows = db
      .prepare("SELECT stance, weight FROM issue_stances WHERE issue = 'climate'")
      .all() as Array<{ stance: string; weight: number }>;
    expect(rows).toEqual([{ stance: "oppose", weight: 2 }]);
  });
});

describe("list_issue_stances tool", () => {
  it("reports an empty list with actionable guidance", async () => {
    withMemoryStorage();
    const result = await listIssueStancesTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No issue stances set");
    expect(text).toContain("politiclaw_set_issue_stance");
  });

  it("renders declared stances weight-desc", async () => {
    withMemoryStorage();
    await setIssueStanceTool.execute!(
      "call-1",
      { issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    await setIssueStanceTool.execute!(
      "call-2",
      { issue: "housing", stance: "support", weight: 3 },
      undefined,
      undefined,
    );
    const result = await listIssueStancesTool.execute!("call-3", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.indexOf("climate")).toBeLessThan(text.indexOf("housing"));
  });
});

describe("delete_issue_stance tool", () => {
  it("reports deleted = true when a row existed, false otherwise", async () => {
    withMemoryStorage();
    await setIssueStanceTool.execute!(
      "call-1",
      { issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    const ok = await deleteIssueStanceTool.execute!(
      "call-2",
      { issue: "climate" },
      undefined,
      undefined,
    );
    expect((ok.details as { deleted: boolean }).deleted).toBe(true);

    const miss = await deleteIssueStanceTool.execute!(
      "call-3",
      { issue: "climate" },
      undefined,
      undefined,
    );
    expect((miss.details as { deleted: boolean }).deleted).toBe(false);
    const missText = (miss.content[0] as { type: "text"; text: string }).text;
    expect(missText).toContain("No issue stance found");
  });
});

describe("record_stance_signal tool", () => {
  it("writes a signal row", async () => {
    const db = withMemoryStorage();
    const result = await recordStanceSignalTool.execute!(
      "call-1",
      { direction: "agree", source: "onboarding", issue: "climate" },
      undefined,
      undefined,
    );
    expect((result.details as { id: number }).id).toBeGreaterThan(0);
    expect(listStanceSignals(db)).toHaveLength(1);
  });

  it("rejects signals with neither issue nor billId", async () => {
    withMemoryStorage();
    await expect(
      recordStanceSignalTool.execute!(
        "call-1",
        { direction: "agree", source: "onboarding" },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });
});
