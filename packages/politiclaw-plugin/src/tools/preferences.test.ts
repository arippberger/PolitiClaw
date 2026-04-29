import { afterEach, describe, expect, it } from "vitest";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  setStorageForTests,
  resetStorageConfigForTests,
} from "../storage/context.js";
import { listStanceSignals, recordStanceSignalTool } from "./preferences.js";

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
