import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  setStorageForTests,
  resetStorageConfigForTests,
} from "../storage/context.js";
import { recordStanceSignalTool } from "./preferences.js";

function withMemoryStorage() {
  const db = openMemoryDb();
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

afterEach(() => {
  resetStorageConfigForTests();
});

describe("record_stance_signal tool", () => {
  it("writes a signal row", async () => {
    const db = withMemoryStorage();
    const result = await recordStanceSignalTool.execute!(
      "call-1",
      { direction: "agree", source: "onboarding", billId: "119-hr-1" },
      undefined,
      undefined,
    );
    expect((result.details as { id: number }).id).toBeGreaterThan(0);
    const count = (
      db.prepare("SELECT COUNT(*) AS n FROM stance_signals").get() as { n: number }
    ).n;
    expect(count).toBe(1);
  });

  it("rejects signals missing a billId", async () => {
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
