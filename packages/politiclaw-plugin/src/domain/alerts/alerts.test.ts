import { describe, expect, it } from "vitest";
import { openMemoryDb } from "../../storage/sqlite.js";
import { listRecentAlerts, recordAlert } from "./index.js";

describe("alerts domain", () => {
  it("persists and reads back a single alert", () => {
    const db = openMemoryDb();
    const row = recordAlert(db, {
      kind: "bill_change",
      refId: "119-hr-1234",
      changeReason: "new",
      summary: "119 HR 1234: Clean Housing Investment Act",
      sourceAdapterId: "congressGov",
      sourceTier: 1,
      createdAt: 1_700_000_000_000,
    });

    expect(row.id).toBeGreaterThan(0);

    const rows = listRecentAlerts(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: "bill_change",
      refId: "119-hr-1234",
      changeReason: "new",
      summary: "119 HR 1234: Clean Housing Investment Act",
      sourceAdapterId: "congressGov",
      sourceTier: 1,
      createdAt: 1_700_000_000_000,
    });
  });

  it("returns rows newest-first, with stable id tiebreak", () => {
    const db = openMemoryDb();
    recordAlert(db, {
      kind: "bill_change",
      refId: "a",
      changeReason: "new",
      summary: "a",
      sourceAdapterId: "x",
      sourceTier: 1,
      createdAt: 10,
    });
    recordAlert(db, {
      kind: "bill_change",
      refId: "b",
      changeReason: "new",
      summary: "b",
      sourceAdapterId: "x",
      sourceTier: 1,
      createdAt: 10,
    });
    recordAlert(db, {
      kind: "event_change",
      refId: "c",
      changeReason: "changed",
      summary: "c",
      sourceAdapterId: "y",
      sourceTier: 2,
      createdAt: 20,
    });

    const rows = listRecentAlerts(db);
    expect(rows.map((r) => r.refId)).toEqual(["c", "b", "a"]);
  });

  it("honors the limit option and does not dedup repeated refIds", () => {
    const db = openMemoryDb();
    for (let i = 0; i < 5; i += 1) {
      recordAlert(db, {
        kind: "bill_change",
        refId: "119-hr-1234",
        changeReason: "changed",
        summary: "same bill, new change",
        sourceAdapterId: "congressGov",
        sourceTier: 1,
        createdAt: 1_000 + i,
      });
    }

    const top3 = listRecentAlerts(db, { limit: 3 });
    expect(top3).toHaveLength(3);
    expect(top3.every((row) => row.refId === "119-hr-1234")).toBe(true);
  });

  it("returns an empty array when the table is empty", () => {
    const db = openMemoryDb();
    expect(listRecentAlerts(db)).toEqual([]);
  });
});
