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
import { scoreRepresentativeTool } from "./repScoring.js";

function stanceHash(
  stances: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight: number }>,
): string {
  const normalized = [...stances]
    .map((stance) => ({ issue: stance.issue, stance: stance.stance, weight: stance.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function withMemoryStorage(): PolitiClawDb {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

function seedScenario(
  db: PolitiClawDb,
  opts: {
    bioguide: string;
    repName: string;
    stance: { issue: string; stance: "support" | "oppose"; weight: number };
    bills: Array<{
      billId: string;
      signalDirection: "agree" | "disagree";
      repPosition: "Yea" | "Nay" | "Present" | "Not Voting";
      isProcedural?: boolean;
    }>;
  },
): void {
  upsertIssueStance(db, opts.stance);
  db.prepare(
    `INSERT INTO reps
       (id, name, office, party, jurisdiction, district, state, contact,
        last_synced, source_adapter_id, source_tier, raw)
     VALUES
       (@id, @name, 'US House', 'D', 'US-CA-12', '12', 'CA', NULL,
        @synced, 'congressLegislators', 1, '{}')`,
  ).run({ id: opts.bioguide, name: opts.repName, synced: Date.now() });

  const hash = stanceHash([opts.stance]);
  let voteNumber = 1;
  for (const bill of opts.bills) {
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES (@id, 119, 'HR', @number, @title, @synced, 'congressGov', 1)`,
    ).run({
      id: bill.billId,
      number: bill.billId.split("-")[2] ?? "1",
      title: `Test bill ${bill.billId}`,
      synced: Date.now(),
    });
    db.prepare(
      `INSERT INTO bill_alignment
         (bill_id, stance_snapshot_hash, relevance, confidence,
          matched_json, rationale, computed_at, source_adapter_id, source_tier)
       VALUES (@bill_id, @hash, 0.8, 0.6, @matches, 'test', @now, 'congressGov', 1)`,
    ).run({
      bill_id: bill.billId,
      hash,
      matches: JSON.stringify([
        {
          issue: opts.stance.issue,
          stance: opts.stance.stance,
          stanceWeight: opts.stance.weight,
          location: "subject",
          matchedText: `subject '${opts.stance.issue}'`,
        },
      ]),
      now: Date.now(),
    });
    recordStanceSignal(db, {
      billId: bill.billId,
      direction: bill.signalDirection,
      weight: 1,
      source: "onboarding",
    });
    db.prepare(
      `INSERT INTO roll_call_votes
         (id, chamber, congress, session, roll_call_number,
          bill_id, is_procedural, source_adapter_id, source_tier, synced_at)
       VALUES (@id, 'House', 119, 1, @rc, @bill_id, @proc, 'congressGov', 1, @synced)`,
    ).run({
      id: `House-119-1-${voteNumber}`,
      rc: voteNumber,
      bill_id: bill.billId,
      proc: bill.isProcedural ? 1 : 0,
      synced: Date.now(),
    });
    db.prepare(
      `INSERT INTO member_votes
         (vote_id, bioguide_id, position, first_name, last_name, party, state)
       VALUES (@vote, @bioguide, @pos, 'A', 'B', 'D', 'CA')`,
    ).run({
      vote: `House-119-1-${voteNumber}`,
      bioguide: opts.bioguide,
      pos: bill.repPosition,
    });
    voteNumber += 1;
  }
}

let db: PolitiClawDb;

beforeEach(() => {
  db = withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
});

describe("politiclaw_score_representative tool", () => {
  it("refuses to score when no stances are declared, with actionable guidance", async () => {
    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "B000001" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Cannot score");
    expect(text).toContain("politiclaw_set_issue_stance");
  });

  it("refuses when rep is not in the reps table", async () => {
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "NO_SUCH_REP" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Cannot score");
    expect(text).toContain("politiclaw_get_my_reps");
  });

  it("renders per-issue alignment plus the exported disclaimer when rich data exists", async () => {
    seedScenario(db, {
      bioguide: "B000002",
      repName: "Rep Aligned",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "B000002" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Representative Rep Aligned");
    expect(text).toContain("US House, CA-12");
    expect(text).toContain("housing");
    expect(text).toContain("100% aligned");
    expect(text).toContain("[119-hr-10]");
    expect(text).toContain("https://www.congress.gov/bill/119/house-bill/10");
    expect(text).toContain("[119-hr-12]");
    expect(text).toContain("informational, not independent journalism");
    expect(text).not.toContain("insufficient data");
  });

  it("renders 'insufficient data' when no evidence meets the floor", async () => {
    upsertIssueStance(db, { issue: "defense", stance: "oppose", weight: 2 });
    db.prepare(
      `INSERT INTO reps
         (id, name, office, party, jurisdiction, district, state, contact,
          last_synced, source_adapter_id, source_tier, raw)
       VALUES ('B000003', 'Rep Unknown', 'US House', 'D', 'US-CA-12', '12', 'CA', NULL,
               @synced, 'congressLegislators', 1, '{}')`,
    ).run({ synced: Date.now() });

    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "B000003" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("insufficient data");
    expect(text).toContain("informational, not independent journalism");
    expect(text).toContain("politiclaw_ingest_votes");
  });

  it("mentions procedural exclusion by default and coverage hints", async () => {
    seedScenario(db, {
      bioguide: "B000004",
      repName: "Rep Proc",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "B000004" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("procedural/unclassified vote");
    expect(text).toContain("excluded");
  });

  it("includes procedural votes when includeProcedural=true (opt-in)", async () => {
    seedScenario(db, {
      bioguide: "B000005",
      repName: "Rep Raw",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "B000005", includeProcedural: true },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("procedural votes included (opt-in)");
    expect(text).toContain("2 counted votes");
  });

  it("rejects malformed input", async () => {
    const result = await scoreRepresentativeTool.execute!(
      "call-1",
      { repId: "" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Invalid input");
  });
});
