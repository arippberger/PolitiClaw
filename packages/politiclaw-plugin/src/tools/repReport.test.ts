import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";

import { openMemoryDb, type PolitiClawDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { recordStanceSignal, upsertIssueStance } from "../domain/preferences/index.js";
import { repReportTool } from "./repReport.js";

function stanceHash(
  stances: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight: number }>,
): string {
  const normalized = [...stances]
    .map((stance) => ({ issue: stance.issue, stance: stance.stance, weight: stance.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function withMemoryStorage(): PolitiClawDb {
  const database = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db: database, kv: new Kv(database) });
  return database;
}

function seedAlignedRep(database: PolitiClawDb): void {
  upsertIssueStance(database, { issue: "housing", stance: "support", weight: 4 });
  database
    .prepare(
      `INSERT INTO reps
         (id, name, office, party, jurisdiction, district, state, contact,
          last_synced, source_adapter_id, source_tier, raw)
       VALUES
         ('B000030', 'Rep Monthly', 'US House', 'D', 'US-CA-12', '12', 'CA', NULL,
          @synced, 'congressLegislators', 1, '{}')`,
    )
    .run({ synced: Date.now() });

  const stance = { issue: "housing", stance: "support" as const, weight: 4 };
  const hash = stanceHash([stance]);
  const billIds = ["119-hr-97", "119-hr-98", "119-hr-99"];
  let roll = 97;
  for (const billId of billIds) {
    database
      .prepare(
        `INSERT INTO bills (id, congress, bill_type, number, title,
                            last_synced, source_adapter_id, source_tier)
         VALUES (@id, 119, 'HR', @number, 'Test', @synced, 'congressGov', 1)`,
      )
      .run({ id: billId, number: billId.split("-")[2], synced: Date.now() });
    database
      .prepare(
        `INSERT INTO bill_alignment
           (bill_id, stance_snapshot_hash, relevance, confidence,
            matched_json, rationale, computed_at, source_adapter_id, source_tier)
         VALUES (@bill_id, @hash, 0.8, 0.6, @matches, 'test', @now, 'congressGov', 1)`,
      )
      .run({
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
    recordStanceSignal(database, {
      billId,
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    const voteId = `House-119-1-${roll}`;
    database
      .prepare(
        `INSERT INTO roll_call_votes
           (id, chamber, congress, session, roll_call_number,
            bill_id, is_procedural, source_adapter_id, source_tier, synced_at)
         VALUES (@id, 'House', 119, 1, @rc, @bill_id, 0, 'congressGov', 1, @synced)`,
      )
      .run({ id: voteId, rc: roll, bill_id: billId, synced: Date.now() });
    database
      .prepare(
        `INSERT INTO member_votes
           (vote_id, bioguide_id, position, first_name, last_name, party, state)
         VALUES (@vote, 'B000030', 'Yea', 'A', 'B', 'D', 'CA')`,
      )
      .run({ vote: voteId });
    roll += 1;
  }
}

let db: PolitiClawDb;

beforeEach(() => {
  db = withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_rep_report tool", () => {
  it("explains when no stances exist", async () => {
    const result = await repReportTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("politiclaw_issue_stances");
  });

  it("includes header, snapshot hash, bill link, and disclaimer when data exists", async () => {
    seedAlignedRep(db);
    const result = await repReportTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("PolitiClaw representative accountability report");
    expect(text).toContain("Stance snapshot hash:");
    expect(text).toContain("Representative Rep Monthly");
    expect(text).toContain("[119-hr-97]");
    expect(text).toContain("https://www.congress.gov/bill/119/house-bill/97");
    expect(text).toContain("informational, not independent journalism");
  });

  it("includes a pattern tally header that counts each band", async () => {
    seedAlignedRep(db);
    const result = await repReportTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toMatch(
      /Patterns: \d+ aligned · \d+ mixed · \d+ concerning · \d+ insufficient data\./,
    );
    expect(text).toContain("1 aligned");
  });
});
