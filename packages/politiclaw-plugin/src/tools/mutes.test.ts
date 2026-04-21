import { afterEach, describe, expect, it } from "vitest";

import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { Kv } from "../storage/kv.js";
import { openMemoryDb } from "../storage/sqlite.js";
import { listMutesTool, muteTool, unmuteTool } from "./mutes.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_mute tool", () => {
  it("persists a mute and renders confirmation text", async () => {
    const db = withMemoryStorage();
    const result = await muteTool.execute!(
      "call-1",
      { kind: "bill", ref: "119-hr-1", reason: "already decided" },
      undefined,
      undefined,
    );
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(result.content[0].text).toContain("119-hr-1");
    expect(result.content[0].text).toContain("already decided");
    const row = db
      .prepare(`SELECT ref, reason FROM mute_list WHERE kind = 'bill'`)
      .get() as { ref: string; reason: string };
    expect(row.ref).toBe("119-hr-1");
    expect(row.reason).toBe("already decided");
  });

  it("normalizes issue refs through the tool boundary", async () => {
    const db = withMemoryStorage();
    await muteTool.execute!(
      "call-1",
      { kind: "issue", ref: "Affordable Housing" },
      undefined,
      undefined,
    );
    const row = db
      .prepare(`SELECT ref FROM mute_list WHERE kind = 'issue'`)
      .get() as { ref: string };
    expect(row.ref).toBe("affordable-housing");
  });

  it("rejects unknown kinds at validation", async () => {
    withMemoryStorage();
    await expect(
      muteTool.execute!(
        "call-1",
        { kind: "invalid", ref: "x" },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });
});

describe("politiclaw_unmute tool", () => {
  it("reports removed=true when the row existed", async () => {
    withMemoryStorage();
    await muteTool.execute!(
      "call-1",
      { kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    const result = await unmuteTool.execute!(
      "call-2",
      { kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ removed: true });
  });

  it("reports removed=false when nothing was muted", async () => {
    withMemoryStorage();
    const result = await unmuteTool.execute!(
      "call-1",
      { kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ removed: false });
  });

  it("rejects a missing ref at validation (does not silently match 'undefined')", async () => {
    withMemoryStorage();
    await expect(
      unmuteTool.execute!(
        "call-1",
        { kind: "bill" } as unknown as { kind: "bill"; ref: string },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });

  it("rejects an empty ref at validation", async () => {
    withMemoryStorage();
    await expect(
      unmuteTool.execute!(
        "call-1",
        { kind: "bill", ref: "   " },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });

  it("rejects unknown kinds at validation", async () => {
    withMemoryStorage();
    await expect(
      unmuteTool.execute!(
        "call-1",
        { kind: "invalid", ref: "x" },
        undefined,
        undefined,
      ),
    ).rejects.toThrow();
  });
});

describe("politiclaw_list_mutes tool", () => {
  it("returns the empty-state message when nothing is muted", async () => {
    withMemoryStorage();
    const result = await listMutesTool.execute!("call-1", {}, undefined, undefined);
    expect(result.content[0].text).toBe("No mutes set.");
    expect(result.details).toMatchObject({ mutes: [] });
  });

  it("lists mutes with their kind, ref, and reason (when set)", async () => {
    withMemoryStorage();
    await muteTool.execute!(
      "call-1",
      { kind: "bill", ref: "119-hr-1", reason: "already decided" },
      undefined,
      undefined,
    );
    await muteTool.execute!(
      "call-2",
      { kind: "issue", ref: "Climate Change" },
      undefined,
      undefined,
    );
    const result = await listMutesTool.execute!("call-3", {}, undefined, undefined);
    expect(result.content[0].text).toContain("[bill] 119-hr-1 — already decided");
    expect(result.content[0].text).toContain("[issue] climate-change");
  });
});
