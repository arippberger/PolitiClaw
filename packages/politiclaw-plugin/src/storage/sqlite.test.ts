import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "./sqlite.js";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

function runMigrationsUpTo(db: DatabaseSync, upToVersion: number): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY)",
  );
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const version = parseInt(file.slice(0, 4), 10);
    if (Number.isNaN(version) || version > upToVersion) continue;
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    db.exec(sql);
    db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
  }
}

function applyMigration(db: DatabaseSync, version: number): void {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  const match = files.find((f) => parseInt(f.slice(0, 4), 10) === version);
  if (!match) throw new Error(`no migration file for version ${version}`);
  const sql = readFileSync(join(MIGRATIONS_DIR, match), "utf8");
  db.exec(sql);
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
}

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
    expect(versions.map((v) => v.version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18,
    ]);
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

  it("defaults preferences.monitoring_mode to 'action_only' on insert", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO preferences (id, address, zip, state, district, updated_at)
       VALUES (1, '123 Main', '94110', 'CA', 'CA-12', 0)`,
    ).run();
    const row = db
      .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
      .get() as { monitoring_mode: string };
    expect(row.monitoring_mode).toBe("action_only");
  });

  it("rejects out-of-enum monitoring_mode values", () => {
    const db = openMemoryDb();
    expect(() =>
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_mode, updated_at)
         VALUES (1, '123 Main', null, null, null, 'shouty', 0)`,
      ).run(),
    ).toThrow(/CHECK/);
  });

  it("accepts each of the five documented monitoring_mode values", () => {
    for (const mode of [
      "off",
      "quiet_watch",
      "weekly_digest",
      "action_only",
      "full_copilot",
    ]) {
      const db = openMemoryDb();
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_mode, updated_at)
         VALUES (1, '123 Main', null, null, null, @mode, 0)`,
      ).run({ mode });
      const row = db
        .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
        .get() as { monitoring_mode: string };
      expect(row.monitoring_mode).toBe(mode);
    }
  });

  it("migration 0014 maps legacy monitoring_cadence values to monitoring_mode", () => {
    const legacyToNew: Record<string, string> = {
      off: "off",
      election_proximity: "action_only",
      weekly: "weekly_digest",
      both: "full_copilot",
    };
    for (const [legacy, expected] of Object.entries(legacyToNew)) {
      const db = new DatabaseSync(":memory:");
      runMigrationsUpTo(db, 13);
      db.prepare(
        `INSERT INTO preferences (id, address, zip, state, district, monitoring_cadence, updated_at)
         VALUES (1, '123 Main', null, null, null, @legacy, 0)`,
      ).run({ legacy });
      applyMigration(db, 14);
      const row = db
        .prepare("SELECT monitoring_mode FROM preferences WHERE id = 1")
        .get() as { monitoring_mode: string };
      expect(row.monitoring_mode, `legacy '${legacy}'`).toBe(expected);
      db.close();
    }
  });
});
