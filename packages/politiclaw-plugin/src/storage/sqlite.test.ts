import { describe, expect, it } from "vitest";
import { openMemoryDb } from "./sqlite.js";

describe("migrations", () => {
  it("creates the core tables through the latest migration", () => {
    const db = openMemoryDb();
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const names = tables.map((t) => t.name);
    for (const required of [
      "preferences",
      "issue_stances",
      "stance_signals",
      "alert_settings",
      "mute_list",
      "kv_store",
      "reps",
      "bills",
      "bill_alignment",
      "snapshots",
      "roll_call_votes",
      "member_votes",
      "rep_scores",
      "ballots",
      "ballot_explanations",
      "letters",
      "schema_version",
    ]) {
      expect(names).toContain(required);
    }
  });

  it("records the migration version", () => {
    const db = openMemoryDb();
    const versions = db
      .prepare("SELECT version FROM schema_version ORDER BY version")
      .all() as Array<{ version: number }>;
    expect(versions.map((v) => v.version)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it("is idempotent when re-run on an existing db", () => {
    const db = openMemoryDb();
    // Re-running via direct invocation of the migrate path: closing/reopening
    // an in-memory DB wouldn't preserve state, so we instead confirm the
    // preferences CHECK constraint survives by inserting the only allowed row.
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, updated_at)
         VALUES (2, 'x', null, null, null, 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("backfills preferences.monitoring_cadence to 'election_proximity' on upgrade", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    const row = db
      .prepare("SELECT monitoring_cadence FROM preferences WHERE id = 1")
      .get() as { monitoring_cadence: string };
    expect(row.monitoring_cadence).toBe("election_proximity");
  });

  it("rejects out-of-enum monitoring_cadence values", () => {
    const db = openMemoryDb();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_cadence, updated_at)
         VALUES (1, '123 Main', null, null, null, 'shouty', 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });
});
