import { describe, expect, it } from "vitest";

import { openMemoryDb } from "../../storage/sqlite.js";
import {
  addMute,
  isMuted,
  listMutedRefs,
  listMutes,
  removeMute,
} from "./index.js";

describe("mutes domain", () => {
  it("addMute inserts and normalizes issue refs to kebab-case", () => {
    const db = openMemoryDb();
    const row = addMute(db, { kind: "issue", ref: "Affordable Housing" });
    expect(row.ref).toBe("affordable-housing");
    expect(row.kind).toBe("issue");
    expect(row.mutedAt).toBeGreaterThan(0);
  });

  it("addMute preserves bill ids as-is (modulo trim)", () => {
    const db = openMemoryDb();
    const row = addMute(db, { kind: "bill", ref: "  119-hr-1  " });
    expect(row.ref).toBe("119-hr-1");
  });

  it("addMute upserts on (kind, ref) — re-muting refreshes reason and timestamp", () => {
    const db = openMemoryDb();
    const first = addMute(db, { kind: "bill", ref: "119-hr-1", reason: "initial" });
    const second = addMute(db, { kind: "bill", ref: "119-hr-1", reason: "followup" });
    expect(second.reason).toBe("followup");
    expect(second.mutedAt).toBeGreaterThanOrEqual(first.mutedAt);
    expect(listMutes(db)).toHaveLength(1);
  });

  it("rejects unknown kinds", () => {
    const db = openMemoryDb();
    expect(() =>
      // @ts-expect-error — invalid kind by design
      addMute(db, { kind: "nope", ref: "x" }),
    ).toThrow();
  });

  it("rejects empty refs", () => {
    const db = openMemoryDb();
    expect(() => addMute(db, { kind: "bill", ref: "   " })).toThrow();
  });

  it("removeMute returns true on a hit and false on a miss", () => {
    const db = openMemoryDb();
    addMute(db, { kind: "rep", ref: "A000360" });
    expect(removeMute(db, { kind: "rep", ref: "A000360" })).toBe(true);
    expect(removeMute(db, { kind: "rep", ref: "A000360" })).toBe(false);
  });

  it("listMutes returns newest first", async () => {
    const db = openMemoryDb();
    addMute(db, { kind: "bill", ref: "119-hr-1" });
    // Advance the clock enough that muted_at is strictly greater.
    await new Promise((resolve) => setTimeout(resolve, 2));
    addMute(db, { kind: "bill", ref: "119-hr-2" });
    const rows = listMutes(db);
    expect(rows.map((r) => r.ref)).toEqual(["119-hr-2", "119-hr-1"]);
  });

  it("listMutedRefs returns a Set scoped to a single kind", () => {
    const db = openMemoryDb();
    addMute(db, { kind: "bill", ref: "119-hr-1" });
    addMute(db, { kind: "bill", ref: "119-hr-2" });
    addMute(db, { kind: "rep", ref: "A000360" });
    const billMutes = listMutedRefs(db, "bill");
    expect(billMutes.has("119-hr-1")).toBe(true);
    expect(billMutes.has("119-hr-2")).toBe(true);
    expect(billMutes.has("A000360")).toBe(false);
  });

  it("isMuted round-trips a normalized issue ref", () => {
    const db = openMemoryDb();
    addMute(db, { kind: "issue", ref: "Climate Change" });
    expect(isMuted(db, { kind: "issue", ref: "climate-change" })).toBe(true);
    expect(isMuted(db, { kind: "issue", ref: "Climate Change" })).toBe(true);
    expect(isMuted(db, { kind: "issue", ref: "other" })).toBe(false);
  });
});
