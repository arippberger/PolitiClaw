import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  setStorageForTests,
  resetStorageConfigForTests,
} from "../storage/context.js";
import { issueStancesTool } from "./issueStances.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_issue_stances — action='set'", () => {
  it("normalizes the issue slug and persists the row", async () => {
    const db = withMemoryStorage();
    const result = await issueStancesTool.execute!(
      "call-1",
      { action: "set", issue: "Affordable Housing", stance: "support", weight: 4 },
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
    await issueStancesTool.execute!(
      "call-1",
      { action: "set", issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    await issueStancesTool.execute!(
      "call-2",
      { action: "set", issue: "climate", stance: "oppose", weight: 2 },
      undefined,
      undefined,
    );
    const rows = db
      .prepare("SELECT stance, weight FROM issue_stances WHERE issue = 'climate'")
      .all() as Array<{ stance: string; weight: number }>;
    expect(rows).toEqual([{ stance: "oppose", weight: 2 }]);
  });

  it("persists note and sourceText alongside the stance row", async () => {
    const db = withMemoryStorage();
    await issueStancesTool.execute!(
      "call-1",
      {
        action: "set",
        issue: "public-lands-and-natural-resources",
        stance: "support",
        weight: 5,
        note: "BWCA wilderness federal protections",
        sourceText: "I really care about keeping the BWCA protected.",
      },
      undefined,
      undefined,
    );
    const rows = db
      .prepare(
        "SELECT issue, note, source_text FROM issue_stances WHERE issue = 'public-lands-and-natural-resources'",
      )
      .all() as Array<{ issue: string; note: string | null; source_text: string | null }>;
    expect(rows).toEqual([
      {
        issue: "public-lands-and-natural-resources",
        note: "BWCA wilderness federal protections",
        source_text: "I really care about keeping the BWCA protected.",
      },
    ]);
  });

  it("returns invalid when stance is missing on set", async () => {
    withMemoryStorage();
    const result = await issueStancesTool.execute!(
      "call-1",
      { action: "set", issue: "climate" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});

describe("politiclaw_issue_stances — action='list'", () => {
  it("reports an empty list with actionable guidance", async () => {
    withMemoryStorage();
    const result = await issueStancesTool.execute!(
      "call-1",
      { action: "list" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("No issue stances set");
    expect(text).toContain("politiclaw_issue_stances");
  });

  it("renders note suffix when a stance carries one", async () => {
    withMemoryStorage();
    await issueStancesTool.execute!(
      "call-1",
      {
        action: "set",
        issue: "public-lands-and-natural-resources",
        stance: "support",
        weight: 5,
        note: "BWCA wilderness federal protections",
      },
      undefined,
      undefined,
    );
    await issueStancesTool.execute!(
      "call-2",
      { action: "set", issue: "housing", stance: "support", weight: 3 },
      undefined,
      undefined,
    );
    const result = await issueStancesTool.execute!(
      "call-3",
      { action: "list" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain(
      "public-lands-and-natural-resources: support (weight 5) — BWCA wilderness federal protections",
    );
    expect(text).toContain("housing: support (weight 3)");
    expect(text).not.toContain("housing: support (weight 3) —");
  });

  it("renders declared stances weight-desc", async () => {
    withMemoryStorage();
    await issueStancesTool.execute!(
      "call-1",
      { action: "set", issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    await issueStancesTool.execute!(
      "call-2",
      { action: "set", issue: "housing", stance: "support", weight: 3 },
      undefined,
      undefined,
    );
    const result = await issueStancesTool.execute!(
      "call-3",
      { action: "list" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text.indexOf("climate")).toBeLessThan(text.indexOf("housing"));
  });
});

describe("politiclaw_issue_stances — action='delete'", () => {
  it("reports deleted = true when a row existed, false otherwise", async () => {
    withMemoryStorage();
    await issueStancesTool.execute!(
      "call-1",
      { action: "set", issue: "climate", stance: "support", weight: 5 },
      undefined,
      undefined,
    );
    const ok = await issueStancesTool.execute!(
      "call-2",
      { action: "delete", issue: "climate" },
      undefined,
      undefined,
    );
    expect((ok.details as { deleted: boolean }).deleted).toBe(true);

    const miss = await issueStancesTool.execute!(
      "call-3",
      { action: "delete", issue: "climate" },
      undefined,
      undefined,
    );
    expect((miss.details as { deleted: boolean }).deleted).toBe(false);
    const missText = (miss.content[0] as { type: "text"; text: string }).text;
    expect(missText).toContain("No issue stance found");
  });

  it("returns invalid when issue is missing on delete", async () => {
    withMemoryStorage();
    const result = await issueStancesTool.execute!(
      "call-1",
      { action: "delete" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});

describe("politiclaw_issue_stances — invalid action", () => {
  it("returns an invalid status when action is missing or unknown", async () => {
    withMemoryStorage();
    const result = await issueStancesTool.execute!("call-1", {}, undefined, undefined);
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});
