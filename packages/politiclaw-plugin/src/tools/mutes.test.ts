import { afterEach, describe, expect, it } from "vitest";

import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { Kv } from "../storage/kv.js";
import { openMemoryDb } from "../storage/sqlite.js";
import { mutesTool } from "./mutes.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_mutes — action='add'", () => {
  it("persists a mute and renders confirmation text", async () => {
    const db = withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "bill", ref: "119-hr-1", reason: "already decided" },
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
    await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "issue", ref: "Affordable Housing" },
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
    const result = await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "invalid", ref: "x" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });

  it("returns invalid when ref is missing on add", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "bill" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
    expect(result.content[0].text).toContain("'ref' is required");
  });

  it("rejects an empty ref on add", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "bill", ref: "   " },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});

describe("politiclaw_mutes — action='remove'", () => {
  it("reports removed=true when the row existed", async () => {
    withMemoryStorage();
    await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    const result = await mutesTool.execute!(
      "call-2",
      { action: "remove", kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ removed: true });
  });

  it("reports removed=false when nothing was muted", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "remove", kind: "rep", ref: "A000360" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ removed: false });
  });

  it("returns invalid when ref is missing on remove", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "remove", kind: "bill" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });

  it("rejects an empty ref on remove", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "remove", kind: "bill", ref: "   " },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });

  it("rejects unknown kinds on remove at validation", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "remove", kind: "invalid", ref: "x" },
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});

describe("politiclaw_mutes — action='list'", () => {
  it("returns the empty-state message when nothing is muted", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      { action: "list" },
      undefined,
      undefined,
    );
    expect(result.content[0].text).toBe("No mutes set.");
    expect(result.details).toMatchObject({ mutes: [] });
  });

  it("lists mutes with their kind, ref, and reason (when set)", async () => {
    withMemoryStorage();
    await mutesTool.execute!(
      "call-1",
      { action: "add", kind: "bill", ref: "119-hr-1", reason: "already decided" },
      undefined,
      undefined,
    );
    await mutesTool.execute!(
      "call-2",
      { action: "add", kind: "issue", ref: "Climate Change" },
      undefined,
      undefined,
    );
    const result = await mutesTool.execute!(
      "call-3",
      { action: "list" },
      undefined,
      undefined,
    );
    expect(result.content[0].text).toContain("[bill] 119-hr-1 — already decided");
    expect(result.content[0].text).toContain("[issue] climate-change");
  });
});

describe("politiclaw_mutes — invalid action", () => {
  it("returns an invalid status when action is missing or unknown", async () => {
    withMemoryStorage();
    const result = await mutesTool.execute!(
      "call-1",
      {},
      undefined,
      undefined,
    );
    expect(result.details).toMatchObject({ status: "invalid" });
  });
});
