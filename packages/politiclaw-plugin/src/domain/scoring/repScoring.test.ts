import { describe, expect, it } from "vitest";
import { openMemoryDb, type PolitiClawDb } from "../../storage/sqlite.js";
import { recordStanceSignal, upsertIssueStance } from "../preferences/index.js";
import { listReps } from "../reps/index.js";
import {
  readStoredRepScores,
  scoreRepresentative,
} from "./index.js";
import { createHash } from "node:crypto";

function stanceHash(
  stances: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight: number }>,
): string {
  const normalized = [...stances]
    .map((stance) => ({ issue: stance.issue, stance: stance.stance, weight: stance.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function insertRep(
  db: PolitiClawDb,
  rep: {
    id: string;
    name: string;
    office?: string;
    state?: string;
    district?: string;
    adapterId?: string;
    tier?: number;
  },
): void {
  db.prepare(
    `INSERT INTO reps
       (id, name, office, party, jurisdiction, district, state, contact,
        last_synced, source_adapter_id, source_tier, raw)
     VALUES
       (@id, @name, @office, NULL, NULL, @district, @state, NULL,
        @last_synced, @adapter_id, @tier, '{}')`,
  ).run({
    id: rep.id,
    name: rep.name,
    office: rep.office ?? "US House",
    district: rep.district ?? "12",
    state: rep.state ?? "CA",
    last_synced: Date.now(),
    adapter_id: rep.adapterId ?? "congressLegislators",
    tier: rep.tier ?? 1,
  });
}

function insertBill(db: PolitiClawDb, id: string, title = "Test Bill"): void {
  db.prepare(
    `INSERT INTO bills
       (id, congress, bill_type, number, title, last_synced, source_adapter_id, source_tier)
     VALUES
       (@id, 119, 'HR', @number, @title, @last_synced, 'congressGov', 1)`,
  ).run({
    id,
    number: id.split("-")[2] ?? "1",
    title,
    last_synced: Date.now(),
  });
}

function insertBillAlignment(
  db: PolitiClawDb,
  opts: {
    billId: string;
    hash: string;
    relevance: number;
    matches: Array<{
      issue: string;
      stance: "support" | "oppose" | "neutral";
      stanceWeight: number;
      location: "policyArea" | "subject" | "title" | "summary";
      matchedText: string;
    }>;
  },
): void {
  db.prepare(
    `INSERT INTO bill_alignment
       (bill_id, stance_snapshot_hash, relevance, confidence,
        matched_json, rationale, computed_at, source_adapter_id, source_tier)
     VALUES
       (@bill_id, @hash, @relevance, 0.6,
        @matched, 'test rationale', @computed_at, 'congressGov', 1)`,
  ).run({
    bill_id: opts.billId,
    hash: opts.hash,
    relevance: opts.relevance,
    matched: JSON.stringify(opts.matches),
    computed_at: Date.now(),
  });
}

function insertRollCallAndVote(
  db: PolitiClawDb,
  opts: {
    voteId: string;
    billId: string;
    rollCall: number;
    bioguideId: string;
    position: "Yea" | "Nay" | "Present" | "Not Voting";
    isProcedural?: boolean | null;
    chamber?: "House" | "Senate";
  },
): void {
  db.prepare(
    `INSERT INTO roll_call_votes
       (id, chamber, congress, session, roll_call_number,
        bill_id, is_procedural, source_adapter_id, source_tier, synced_at)
     VALUES
       (@id, @chamber, 119, 1, @roll_call, @bill_id, @is_procedural,
        'congressGov', 1, @synced_at)`,
  ).run({
    id: opts.voteId,
    chamber: opts.chamber ?? "House",
    roll_call: opts.rollCall,
    bill_id: opts.billId,
    is_procedural:
      opts.isProcedural === null
        ? null
        : opts.isProcedural === true
          ? 1
          : 0,
    synced_at: Date.now(),
  });
  db.prepare(
    `INSERT INTO member_votes
       (vote_id, bioguide_id, position, first_name, last_name, party, state)
     VALUES
       (@vote_id, @bioguide, @position, 'A', 'B', 'D', 'CA')`,
  ).run({
    vote_id: opts.voteId,
    bioguide: opts.bioguideId,
    position: opts.position,
  });
}

function seedMinimalScenario(
  db: PolitiClawDb,
  opts: {
    bioguide: string;
    stance: { issue: string; stance: "support" | "oppose"; weight: number };
    bills: Array<{
      billId: string;
      signalDirection: "agree" | "disagree";
      repPosition: "Yea" | "Nay" | "Present" | "Not Voting";
      isProcedural?: boolean | null;
      relevance?: number;
    }>;
  },
): string {
  upsertIssueStance(db, opts.stance);
  insertRep(db, { id: opts.bioguide, name: "Rep Test" });

  const hash = stanceHash([opts.stance]);
  let voteNumber = 1;
  for (const bill of opts.bills) {
    insertBill(db, bill.billId);
    insertBillAlignment(db, {
      billId: bill.billId,
      hash,
      relevance: bill.relevance ?? 0.8,
      matches: [
        {
          issue: opts.stance.issue,
          stance: opts.stance.stance,
          stanceWeight: opts.stance.weight,
          location: "subject",
          matchedText: `subject '${opts.stance.issue}'`,
        },
      ],
    });
    recordStanceSignal(db, {
      billId: bill.billId,
      direction: bill.signalDirection,
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: `House-119-1-${voteNumber}`,
      billId: bill.billId,
      rollCall: voteNumber,
      bioguideId: opts.bioguide,
      position: bill.repPosition,
      isProcedural: bill.isProcedural,
    });
    voteNumber += 1;
  }
  return hash;
}

describe("scoreRepresentative", () => {
  it("returns no_stances when the user hasn't declared any", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B000001", name: "Rep Test" });
    const result = scoreRepresentative(db, "B000001");
    expect(result.status).toBe("no_stances");
  });

  it("returns rep_not_found when the bioguide is not in the reps table", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    const result = scoreRepresentative(db, "NONEXISTENT");
    expect(result.status).toBe("rep_not_found");
  });

  it("produces an aligned score when rep voted Yea on bills the user signalled agree", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000002",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = scoreRepresentative(db, "B000002");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const housing = result.perIssue.find((issue) => issue.issue === "housing");
    expect(housing).toBeDefined();
    expect(housing!.alignedCount).toBe(3);
    expect(housing!.conflictedCount).toBe(0);
    expect(housing!.alignmentScore).toBe(1);
    expect(housing!.belowConfidenceFloor).toBe(false);
    expect(result.consideredVoteCount).toBe(3);
  });

  it("produces a conflicted score when rep voted opposite to user's signals", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000003",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Nay" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Nay" },
      ],
    });
    const result = scoreRepresentative(db, "B000003");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const housing = result.perIssue[0]!;
    expect(housing.conflictedCount).toBe(2);
    expect(housing.alignedCount).toBe(0);
    expect(housing.alignmentScore).toBe(0);
  });

  it("excludes procedural votes by default", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000004",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
        { billId: "119-hr-12", signalDirection: "agree", repPosition: "Nay", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000004");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(1);
    const housing = result.perIssue[0]!;
    expect(housing.consideredCount).toBe(2);
  });

  it("includes procedural votes when excludeProcedural=false (opt-in)", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000005",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: true },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000005", { excludeProcedural: false });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(0);
    expect(result.perIssue[0]!.consideredCount).toBe(2);
    expect(result.proceduralExcluded).toBe(false);
  });

  it("persists procedural_excluded consistent with excludeProcedural option", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000015",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });
    const snapshotHash = stanceHash([{ issue: "housing", stance: "support", weight: 4 }]);

    scoreRepresentative(db, "B000015", { excludeProcedural: false });
    const whenIncluded = db
      .prepare(
        `SELECT procedural_excluded FROM rep_scores
          WHERE rep_id = @id AND stance_snapshot_hash = @hash AND issue = @issue`,
      )
      .get({ id: "B000015", hash: snapshotHash, issue: "housing" }) as {
      procedural_excluded: number;
    };
    expect(whenIncluded.procedural_excluded).toBe(0);

    scoreRepresentative(db, "B000015", { excludeProcedural: true });
    const whenExcluded = db
      .prepare(
        `SELECT procedural_excluded FROM rep_scores
          WHERE rep_id = @id AND stance_snapshot_hash = @hash AND issue = @issue`,
      )
      .get({ id: "B000015", hash: snapshotHash, issue: "housing" }) as {
      procedural_excluded: number;
    };
    expect(whenExcluded.procedural_excluded).toBe(1);
  });

  it("treats is_procedural=NULL as procedural (unknown → excluded by default)", () => {
    const db = openMemoryDb();
    seedMinimalScenario(db, {
      bioguide: "B000006",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea", isProcedural: null },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea", isProcedural: false },
      ],
    });

    const result = scoreRepresentative(db, "B000006");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.skippedProceduralCount).toBe(1);
    expect(result.perIssue[0]!.consideredCount).toBe(1);
  });

  it("reports missing-signal coverage when bills touched stances but user didn't signal", () => {
    const db = openMemoryDb();
    const stance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, stance);
    insertRep(db, { id: "B000007", name: "Rep Test" });
    const hash = stanceHash([stance]);

    insertBill(db, "119-hr-10");
    insertBill(db, "119-hr-11");
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash,
        relevance: 0.7,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
    }
    // Only signal one of them.
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000007",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000007");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.missingSignalBillCount).toBe(1);
  });

  it("reports bills-without-rep-votes when user signalled but rep has no matching roll-call", () => {
    const db = openMemoryDb();
    const stance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, stance);
    insertRep(db, { id: "B000008", name: "Rep Test" });
    const hash = stanceHash([stance]);

    insertBill(db, "119-hr-10");
    insertBill(db, "119-hr-11");
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash,
        relevance: 0.7,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 4,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
      recordStanceSignal(db, {
        billId,
        direction: "agree",
        weight: 1,
        source: "onboarding",
      });
    }
    // Rep voted on only one of the two signalled bills.
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000008",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000008");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.billsWithoutRepVotes).toBe(1);
  });

  it("persists rep_scores keyed by (rep_id, stance_snapshot_hash, issue)", () => {
    const db = openMemoryDb();
    const hash = seedMinimalScenario(db, {
      bioguide: "B000009",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
      ],
    });

    const result = scoreRepresentative(db, "B000009");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const stored = readStoredRepScores(db, "B000009", hash);
    expect(stored).toHaveLength(1);
    expect(stored[0]!.issue).toBe("housing");
    expect(stored[0]!.alignedCount).toBe(2);
    expect(stored[0]!.citedBills.map((bill) => bill.billId)).toEqual(["119-hr-10", "119-hr-11"]);
  });

  it("keeps older scores when user edits stances (snapshot hash is part of PK)", () => {
    const db = openMemoryDb();
    const oldHash = seedMinimalScenario(db, {
      bioguide: "B000010",
      stance: { issue: "housing", stance: "support", weight: 4 },
      bills: [
        { billId: "119-hr-10", signalDirection: "agree", repPosition: "Yea" },
        { billId: "119-hr-11", signalDirection: "agree", repPosition: "Yea" },
      ],
    });
    const first = scoreRepresentative(db, "B000010");
    expect(first.status).toBe("ok");

    // Edit the stance list — different weight ⇒ different hash.
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 5 });
    // Re-insert bill_alignment for the new hash (otherwise there's nothing to score against).
    const newHash = stanceHash([{ issue: "housing", stance: "support", weight: 5 }]);
    for (const billId of ["119-hr-10", "119-hr-11"]) {
      insertBillAlignment(db, {
        billId,
        hash: newHash,
        relevance: 0.8,
        matches: [
          {
            issue: "housing",
            stance: "support",
            stanceWeight: 5,
            location: "subject",
            matchedText: "subject 'housing'",
          },
        ],
      });
    }
    scoreRepresentative(db, "B000010");

    expect(readStoredRepScores(db, "B000010", oldHash)).toHaveLength(1);
    expect(readStoredRepScores(db, "B000010", newHash)).toHaveLength(1);
  });

  it("filters evidence to the current stance set (stale matched_json issues are ignored)", () => {
    const db = openMemoryDb();
    const currentStance = { issue: "housing", stance: "support" as const, weight: 4 };
    upsertIssueStance(db, currentStance);
    insertRep(db, { id: "B000011", name: "Rep Test" });
    const hash = stanceHash([currentStance]);

    // Bill alignment stored under the current hash, but matched_json references
    // an issue that's not in the current stance set (simulating a drift).
    insertBill(db, "119-hr-10");
    insertBillAlignment(db, {
      billId: "119-hr-10",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "not-current-stance",
          stance: "support",
          stanceWeight: 3,
          location: "subject",
          matchedText: "subject 'something-else'",
        },
      ],
    });
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000011",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000011");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // The single vote was filtered out because its matched issue isn't in the stance list.
    expect(result.consideredVoteCount).toBe(0);
    expect(result.perIssue[0]!.belowConfidenceFloor).toBe(true);
  });

  it("rep lookup is tolerant of listReps ordering (uses exact id match, not array index)", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B000012", name: "Senator One", office: "US Senate", district: undefined });
    insertRep(db, { id: "B000013", name: "Rep Two" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const first = scoreRepresentative(db, "B000013");
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.rep.id).toBe("B000013");
  });

  it("uses the latest stance signal when multiple exist for the same bill", () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    insertRep(db, { id: "B000014", name: "Rep Test" });
    const hash = stanceHash([{ issue: "housing", stance: "support", weight: 4 }]);

    insertBill(db, "119-hr-10");
    insertBillAlignment(db, {
      billId: "119-hr-10",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "housing",
          stance: "support",
          stanceWeight: 4,
          location: "subject",
          matchedText: "subject 'housing'",
        },
      ],
    });
    // Older signal (disagree), newer signal (agree). Latest should win.
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "disagree",
      weight: 1,
      source: "onboarding",
    });
    recordStanceSignal(db, {
      billId: "119-hr-10",
      direction: "agree",
      weight: 1,
      source: "monitoring",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-1",
      billId: "119-hr-10",
      rollCall: 1,
      bioguideId: "B000014",
      position: "Yea",
      isProcedural: false,
    });
    // Need at least 2 considered votes to get above the 1-vote noise floor,
    // so add a second independent bill+signal+vote.
    insertBill(db, "119-hr-11");
    insertBillAlignment(db, {
      billId: "119-hr-11",
      hash,
      relevance: 0.8,
      matches: [
        {
          issue: "housing",
          stance: "support",
          stanceWeight: 4,
          location: "subject",
          matchedText: "subject 'housing'",
        },
      ],
    });
    recordStanceSignal(db, {
      billId: "119-hr-11",
      direction: "agree",
      weight: 1,
      source: "onboarding",
    });
    insertRollCallAndVote(db, {
      voteId: "House-119-1-2",
      billId: "119-hr-11",
      rollCall: 2,
      bioguideId: "B000014",
      position: "Yea",
      isProcedural: false,
    });

    const result = scoreRepresentative(db, "B000014");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    // Both bills should count as aligned (latest signal on bill 10 was 'agree' + repPosition Yea).
    expect(result.perIssue[0]!.alignedCount).toBe(2);
    expect(result.perIssue[0]!.conflictedCount).toBe(0);
  });
});

// Ensure listReps/insertRep helper actually persists (smoke — the real behaviour is
// exercised in src/domain/reps/ tests; this guards the test-helper itself).
describe("test harness", () => {
  it("insertRep round-trips via listReps", () => {
    const db = openMemoryDb();
    insertRep(db, { id: "B999", name: "Rep Smoke" });
    expect(listReps(db).map((rep) => rep.id)).toContain("B999");
  });
});
