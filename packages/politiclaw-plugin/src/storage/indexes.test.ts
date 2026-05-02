import { describe, expect, it } from "vitest";
import { openMemoryDb, type PolitiClawDb } from "./sqlite.js";

type PlanRow = { id: number; parent: number; notused: number; detail: string };

function planFor(db: PolitiClawDb, sql: string, params: Record<string, unknown> = {}): string[] {
  const rows = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(params) as PlanRow[];
  return rows.map((row) => row.detail);
}

function seedAlignmentAndSignals(db: PolitiClawDb): void {
  db.prepare(
    `INSERT INTO bills (id, congress, bill_type, number, title,
                        last_synced, source_adapter_id, source_tier, raw)
     VALUES ('119-hr-1', 119, 'HR', '1', 'Bill One',
             0, 'congressgov', 1, '{}')`,
  ).run();

  db.prepare(
    `INSERT INTO bill_alignment (bill_id, stance_snapshot_hash, relevance, confidence,
                                 matched_json, rationale, computed_at,
                                 source_adapter_id, source_tier)
     VALUES ('119-hr-1', 'hash-a', 0.9, 0.8, '[]', 'ok', 0, 'congressgov', 1)`,
  ).run();

  db.prepare(
    `INSERT INTO stance_signals (bill_id, direction, weight, source, created_at)
     VALUES ('119-hr-1', 'agree', 1.0, 'monitoring', 0)`,
  ).run();
}

describe("hot-path index usage (migration 0011)", () => {
  it("bill_alignment WHERE stance_snapshot_hash = ? uses bill_alignment_stance_snapshot", () => {
    const db = openMemoryDb();
    seedAlignmentAndSignals(db);
    const details = planFor(
      db,
      "SELECT COUNT(*) FROM bill_alignment WHERE stance_snapshot_hash = @hash",
      { hash: "hash-a" },
    );
    const joined = details.join("\n");
    expect(joined).toMatch(/USING\s+(COVERING\s+)?INDEX bill_alignment_stance_snapshot/);
  });

  it("stance_signals per-bill direction lookup uses stance_signals_bill_dir_created", () => {
    const db = openMemoryDb();
    seedAlignmentAndSignals(db);
    // Mirrors the inner side of the computeCoverage LEFT JOIN: for each
    // bill_alignment row, find signal rows keyed by bill_id with a direction
    // filter. The composite covers both the lookup and the filter.
    const details = planFor(
      db,
      `SELECT direction, weight, created_at
         FROM stance_signals
        WHERE bill_id = @bill AND direction IN ('agree','disagree')
        ORDER BY created_at DESC`,
      { bill: "119-hr-1" },
    );
    const joined = details.join("\n");
    expect(joined).toMatch(/USING\s+(COVERING\s+)?INDEX stance_signals_bill_dir_created/);
  });
});
