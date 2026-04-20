import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { recordStanceSignal, upsertIssueStance } from "../preferences/index.js";
import { hashStancesForRepScoring } from "../scoring/index.js";
import * as scoringIndex from "../scoring/index.js";
import { generateRepReport } from "./repReport.js";

function stanceHash(
  stances: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight: number }>,
): string {
  const normalized = [...stances]
    .map((stance) => ({ issue: stance.issue, stance: stance.stance, weight: stance.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function seedSingleRepScenario(db: PolitiClawDb, bioguide: string): void {
  const stance = { issue: "housing", stance: "support" as const, weight: 4 };
  upsertIssueStance(db, stance);
  db.prepare(
    `INSERT INTO reps
       (id, name, office, party, jurisdiction, district, state, contact,
        last_synced, source_adapter_id, source_tier, raw)
     VALUES
       (@id, @name, 'US House', 'D', 'US-CA-12', '12', 'CA', NULL,
        @synced, 'congressLegislators', 1, '{}')`,
  ).run({ id: bioguide, name: "Rep One", synced: Date.now() });

  const hash = stanceHash([stance]);
  const billId = "119-hr-10";
  db.prepare(
    `INSERT INTO bills (id, congress, bill_type, number, title,
                        last_synced, source_adapter_id, source_tier)
     VALUES (@id, 119, 'HR', '10', 'Test', @synced, 'congressGov', 1)`,
  ).run({ id: billId, synced: Date.now() });
  db.prepare(
    `INSERT INTO bill_alignment
       (bill_id, stance_snapshot_hash, relevance, confidence,
        matched_json, rationale, computed_at, source_adapter_id, source_tier)
     VALUES (@bill_id, @hash, 0.8, 0.6, @matches, 'test', @now, 'congressGov', 1)`,
  ).run({
    bill_id: billId,
    hash,
    matches: JSON.stringify([
      {
        issue: stance.issue,
        stance: stance.stance,
        stanceWeight: stance.weight,
        location: "subject",
        matchedText: "housing",
      },
    ]),
    now: Date.now(),
  });
  recordStanceSignal(db, {
    billId,
    direction: "agree",
    weight: 1,
    source: "onboarding",
  });
  db.prepare(
    `INSERT INTO roll_call_votes
       (id, chamber, congress, session, roll_call_number,
        bill_id, is_procedural, source_adapter_id, source_tier, synced_at)
     VALUES ('House-119-1-1', 'House', 119, 1, 1, @bill_id, 0, 'congressGov', 1, @synced)`,
  ).run({ bill_id: billId, synced: Date.now() });
  db.prepare(
    `INSERT INTO member_votes
       (vote_id, bioguide_id, position, first_name, last_name, party, state)
     VALUES ('House-119-1-1', @bioguide, 'Yea', 'A', 'B', 'D', 'CA')`,
  ).run({ bioguide });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("generateRepReport", () => {
  it("returns no_stances when the user has not declared issues", () => {
    const db = openMemoryDb();
    const result = generateRepReport(db);
    expect(result.status).toBe("no_stances");
  });

  it("returns no_reps when stances exist but the reps table is empty", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = generateRepReport(db);
    expect(result.status).toBe("no_reps");
  });

  it("returns one row per stored rep with snapshot hash", () => {
    const db = openMemoryDb();
    seedSingleRepScenario(db, "B000020");
    db.prepare(
      `INSERT INTO reps
         (id, name, office, party, jurisdiction, district, state, contact,
          last_synced, source_adapter_id, source_tier, raw)
       VALUES
         ('B000021', 'Rep Two', 'US House', 'R', 'US-CA-11', '11', 'CA', NULL,
          @synced, 'congressLegislators', 1, '{}')`,
    ).run({ synced: Date.now() });
    db.prepare(
      `INSERT INTO member_votes
         (vote_id, bioguide_id, position, first_name, last_name, party, state)
       VALUES ('House-119-1-1', 'B000021', 'Nay', 'C', 'D', 'R', 'CA')`,
    ).run();

    const result = generateRepReport(db);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.rows).toHaveLength(2);
    expect(result.stanceSnapshotHash).toBe(
      hashStancesForRepScoring([{ issue: "housing", stance: "support", weight: 4 }]),
    );
    expect(result.rows.every((row) => row.result.status === "ok")).toBe(true);
    const secondRow = result.rows.find((row) => row.rep.id === "B000021");
    expect(secondRow).toBeDefined();
    expect(secondRow!.result.status).toBe("ok");
    if (secondRow!.result.status !== "ok") return;
    const housingSecond = secondRow!.result.perIssue.find((issue) => issue.issue === "housing");
    expect(housingSecond!.conflictedCount).toBe(1);
  });

  it("still returns the stance snapshot hash when every rep score fails", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    db.prepare(
      `INSERT INTO reps
         (id, name, office, party, jurisdiction, district, state, contact,
          last_synced, source_adapter_id, source_tier, raw)
       VALUES
         ('GHOST', 'Ghost Rep', 'US House', 'D', 'US-CA-12', '12', 'CA', NULL,
          @synced, 'congressLegislators', 1, '{}')`,
    ).run({ synced: Date.now() });

    vi.spyOn(scoringIndex, "scoreRepresentative").mockReturnValue({
      status: "rep_not_found",
      reason: "no stored rep with id 'GHOST'",
      actionable: "call politiclaw_get_my_reps first",
    });

    const result = generateRepReport(db);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    expect(result.stanceSnapshotHash).toBe(
      hashStancesForRepScoring([{ issue: "housing", stance: "support", weight: 4 }]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]!.result.status).toBe("rep_not_found");
  });
});
