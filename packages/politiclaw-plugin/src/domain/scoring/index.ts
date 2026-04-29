import { createHash } from "node:crypto";
import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { BillRef } from "../../sources/bills/types.js";
import { getBillDetail, type StoredBill } from "../bills/index.js";
import { listIssueStances } from "../preferences/index.js";
import type { IssueStance } from "../preferences/types.js";
import { listReps, type StoredRep } from "../reps/index.js";
import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  PATTERN_ALIGNED_MIN,
  PATTERN_CONCERNING_MAX,
  PATTERN_CONCERNING_MIN_WEIGHT,
  computeBillAlignment,
  type AlignmentResult,
  type StanceMatch,
} from "./alignment.js";
import {
  computeBillDirection,
  type DirectionForStance,
  type LlmClient,
} from "./direction.js";
import {
  computeRepAlignment,
  type BillEvidence,
  type RepIssueAlignment,
} from "./repAlignment.js";

export {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  PATTERN_ALIGNED_MIN,
  PATTERN_CONCERNING_MAX,
  PATTERN_CONCERNING_MIN_WEIGHT,
};
export type { AlignmentResult, StanceMatch };
export type { RepIssueAlignment };
export type { DirectionForStance, LlmClient };

export type ScoreBillResult =
  | {
      status: "ok";
      bill: StoredBill;
      alignment: AlignmentResult;
      direction: DirectionForStance[] | null;
      fromCache: boolean;
      source: { adapterId: string; tier: number };
    }
  | { status: "no_stances"; reason: string; actionable: string }
  | { status: "unavailable"; reason: string; actionable?: string };

export type ScoreBillOptions = {
  refresh?: boolean;
  /**
   * When provided, the tool asks the LLM to classify whether the bill
   * advances or obstructs each declared stance. Without it, the result
   * preserves today's behavior — alignment only, no direction.
   */
  llm?: LlmClient;
};

export async function scoreBill(
  db: PolitiClawDb,
  resolver: BillsResolver,
  ref: BillRef,
  opts: ScoreBillOptions = {},
): Promise<ScoreBillResult> {
  const stances = listIssueStances(db).map<IssueStance>((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
    ...(row.note ? { note: row.note } : {}),
  }));

  const detail = await getBillDetail(db, resolver, ref, { refresh: opts.refresh });
  if (detail.status === "unavailable") {
    return {
      status: "unavailable",
      reason: detail.reason,
      actionable: detail.actionable,
    };
  }

  if (stances.length === 0) {
    return {
      status: "no_stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_issue_stances with action='set' before scoring a bill",
    };
  }

  const alignment = computeBillAlignment(detail.bill, stances);
  persistAlignment(db, detail.bill.id, alignment, detail.source);

  let direction: DirectionForStance[] | null = null;
  if (opts.llm && !alignment.belowConfidenceFloor) {
    direction = await computeBillDirection(detail.bill, stances, opts.llm);
  }

  return {
    status: "ok",
    bill: detail.bill,
    alignment,
    direction,
    fromCache: detail.fromCache,
    source: detail.source,
  };
}

function persistAlignment(
  db: PolitiClawDb,
  billId: string,
  alignment: AlignmentResult,
  source: { adapterId: string; tier: number },
): void {
  db.prepare(
    `INSERT INTO bill_alignment (bill_id, stance_snapshot_hash, relevance, confidence,
                                 matched_json, rationale, computed_at,
                                 source_adapter_id, source_tier)
     VALUES (@bill_id, @hash, @relevance, @confidence, @matched, @rationale,
             @computed_at, @adapter_id, @tier)
     ON CONFLICT(bill_id, stance_snapshot_hash) DO UPDATE SET
       relevance         = excluded.relevance,
       confidence        = excluded.confidence,
       matched_json      = excluded.matched_json,
       rationale         = excluded.rationale,
       computed_at       = excluded.computed_at,
       source_adapter_id = excluded.source_adapter_id,
       source_tier       = excluded.source_tier`,
  ).run({
    bill_id: billId,
    hash: alignment.stanceSnapshotHash,
    relevance: alignment.relevance,
    confidence: alignment.confidence,
    matched: JSON.stringify(alignment.matches),
    rationale: alignment.rationale,
    computed_at: Date.now(),
    adapter_id: source.adapterId,
    tier: source.tier,
  });
}

export type StoredAlignment = {
  billId: string;
  stanceSnapshotHash: string;
  relevance: number;
  confidence: number;
  matches: StanceMatch[];
  rationale: string;
  computedAt: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export type ScoreRepresentativeOptions = {
  /**
   * When true, procedural roll calls (and NULL-classified rows) are filtered
   * out of tallies. Default is `true` because the exclusion is the safer
   * default. Flip to `false` to see the raw tally including procedural
   * motions.
   */
  excludeProcedural?: boolean;
};

export type ScoreRepresentativeResult =
  | {
      status: "ok";
      rep: StoredRep;
      stanceSnapshotHash: string;
      perIssue: RepIssueAlignment[];
      consideredVoteCount: number;
      skippedProceduralCount: number;
      skippedNeutralPositionCount: number;
      missingSignalBillCount: number;
      billsWithoutRepVotes: number;
      proceduralExcluded: boolean;
    }
  | { status: "no_stances"; reason: string; actionable: string }
  | { status: "rep_not_found"; reason: string; actionable: string };

/**
 * Score a representative's voting record against the user's declared stances.
 *
 * Composition:
 *   - `issue_stances` — what the user cares about.
 *   - `stance_signals` — how the user would have voted on specific bills
 *     (`agree` → Yea; `disagree` → Nay; `skip` is ignored). This is the only
 *     source of direction for rep scoring; the LLM-sourced directional
 *     framing from `./direction.ts` is used elsewhere (bill scoring, ballot
 *     measures) but is deliberately excluded here so the rep's record is
 *     counted against user-declared signals, not narrated.
 *   - `bill_alignment` (current `stance_snapshot_hash`) — which bills touch
 *     which issues. Bills that have not been scored under the current stance
 *     set are invisible to this function; call `politiclaw_score_bill` or
 *     `politiclaw_check_upcoming_votes` first to broaden coverage.
 *   - `roll_call_votes` + `member_votes` (keyed on `bioguide_id`) — the
 *     actual vote record. House votes come from api.congress.gov; Senate
 *     votes come from voteview.com via the same ingest tool. Both chambers
 *     score the same way; senators only surface as "insufficient data" if
 *     `politiclaw_ingest_votes` has not been run for the Senate yet.
 *
 * The function does not make live API calls; everything is read from the
 * plugin DB. Persistence writes one `rep_scores` row per active stance; the
 * composite PK `(rep_id, stance_snapshot_hash, issue)` keeps historical
 * scores intact when the user edits stances.
 */
export function scoreRepresentative(
  db: PolitiClawDb,
  repId: string,
  opts: ScoreRepresentativeOptions = {},
): ScoreRepresentativeResult {
  const stances = listIssueStances(db).map<IssueStance>((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
    ...(row.note ? { note: row.note } : {}),
  }));
  if (stances.length === 0) {
    return {
      status: "no_stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_issue_stances with action='set' before scoring a representative",
    };
  }

  const rep = listReps(db).find((candidate) => candidate.id === repId);
  if (!rep) {
    return {
      status: "rep_not_found",
      reason: `no stored rep with id '${repId}'`,
      actionable:
        "call politiclaw_get_my_reps first; pass the exact id (bioguide where available)",
    };
  }

  const stanceSnapshotHash = hashStancesForRepScoring(stances);
  const excludeProcedural = opts.excludeProcedural ?? true;

  const rawEvidence = readEvidenceRows(db, repId, stanceSnapshotHash);
  const coverage = computeCoverage(db, repId, stanceSnapshotHash);

  const evidence = expandEvidence(rawEvidence, stances);

  const alignment = computeRepAlignment(stances, evidence, { excludeProcedural });

  persistRepScores(db, rep, stanceSnapshotHash, alignment.perIssue, excludeProcedural);

  return {
    status: "ok",
    rep,
    stanceSnapshotHash,
    perIssue: alignment.perIssue,
    consideredVoteCount: alignment.consideredVoteCount,
    skippedProceduralCount: alignment.skippedProceduralCount,
    skippedNeutralPositionCount: alignment.skippedNeutralPositionCount,
    missingSignalBillCount: coverage.missingSignalBillCount,
    billsWithoutRepVotes: coverage.billsWithoutRepVotes,
    proceduralExcluded: excludeProcedural,
  };
}

type EvidenceRow = {
  bill_id: string;
  relevance: number;
  matched_json: string;
  user_direction: "agree" | "disagree";
  user_signal_weight: number;
  rep_position: "Yea" | "Nay" | "Present" | "Not Voting";
  vote_id: string;
  is_procedural: number | null;
  source_adapter_id: string;
  source_tier: number;
};

function readEvidenceRows(
  db: PolitiClawDb,
  repId: string,
  stanceSnapshotHash: string,
): EvidenceRow[] {
  return db
    .prepare(
      `WITH latest_signals AS (
         SELECT bill_id, direction, weight, created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY bill_id
                  ORDER BY created_at DESC, id DESC
                ) AS rn
           FROM stance_signals
          WHERE bill_id IS NOT NULL AND direction IN ('agree','disagree')
       )
       SELECT ba.bill_id,
              ba.relevance,
              ba.matched_json,
              ba.source_adapter_id,
              ba.source_tier,
              ls.direction AS user_direction,
              ls.weight    AS user_signal_weight,
              mv.position  AS rep_position,
              rcv.id       AS vote_id,
              rcv.is_procedural
         FROM bill_alignment ba
         JOIN latest_signals ls
           ON ls.bill_id = ba.bill_id AND ls.rn = 1
         JOIN roll_call_votes rcv
           ON rcv.bill_id = ba.bill_id
         JOIN member_votes mv
           ON mv.vote_id = rcv.id AND mv.bioguide_id = @bioguide
        WHERE ba.stance_snapshot_hash = @hash`,
    )
    .all({ bioguide: repId, hash: stanceSnapshotHash }) as EvidenceRow[];
}

function expandEvidence(
  rows: readonly EvidenceRow[],
  stances: readonly IssueStance[],
): BillEvidence[] {
  const stanceByIssue = new Map(stances.map((stance) => [stance.issue, stance]));
  const evidence: BillEvidence[] = [];
  for (const row of rows) {
    const matches = safeParseMatches(row.matched_json);
    for (const match of matches) {
      const stance = stanceByIssue.get(match.issue);
      // If the user removed this issue after the bill was scored, skip it —
      // the primitive only scores against *currently declared* stances.
      if (!stance || stance.stance === "neutral") continue;
      evidence.push({
        billId: row.bill_id,
        issue: match.issue,
        stance: stance.stance,
        stanceWeight: stance.weight,
        relevance: row.relevance,
        userDirection: row.user_direction,
        userSignalWeight: row.user_signal_weight,
        repPosition: row.rep_position,
        isProcedural:
          row.is_procedural === null ? null : row.is_procedural === 1,
        voteId: row.vote_id,
      });
    }
  }
  return evidence;
}

function safeParseMatches(matchedJson: string): StanceMatch[] {
  try {
    const parsed = JSON.parse(matchedJson) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as StanceMatch[];
  } catch {
    return [];
  }
}

type CoverageStats = {
  missingSignalBillCount: number;
  billsWithoutRepVotes: number;
};

function computeCoverage(
  db: PolitiClawDb,
  repId: string,
  stanceSnapshotHash: string,
): CoverageStats {
  const missingSignal = db
    .prepare(
      `SELECT COUNT(DISTINCT ba.bill_id) AS c
         FROM bill_alignment ba
         LEFT JOIN stance_signals ss
           ON ss.bill_id = ba.bill_id
          AND ss.direction IN ('agree','disagree')
        WHERE ba.stance_snapshot_hash = @hash
          AND ss.id IS NULL`,
    )
    .get({ hash: stanceSnapshotHash }) as { c: number };

  const billsWithoutVotes = db
    .prepare(
      `SELECT COUNT(DISTINCT ba.bill_id) AS c
         FROM bill_alignment ba
         JOIN stance_signals ss
           ON ss.bill_id = ba.bill_id
          AND ss.direction IN ('agree','disagree')
         LEFT JOIN (
           SELECT DISTINCT rcv.bill_id
             FROM roll_call_votes rcv
             JOIN member_votes mv
               ON mv.vote_id = rcv.id AND mv.bioguide_id = @bioguide
         ) rv ON rv.bill_id = ba.bill_id
        WHERE ba.stance_snapshot_hash = @hash
          AND rv.bill_id IS NULL`,
    )
    .get({ hash: stanceSnapshotHash, bioguide: repId }) as { c: number };

  return {
    missingSignalBillCount: missingSignal.c,
    billsWithoutRepVotes: billsWithoutVotes.c,
  };
}

function persistRepScores(
  db: PolitiClawDb,
  rep: StoredRep,
  stanceSnapshotHash: string,
  perIssue: readonly RepIssueAlignment[],
  proceduralExcluded: boolean,
): void {
  const upsert = db.prepare(
    `INSERT INTO rep_scores
       (rep_id, stance_snapshot_hash, issue,
        aligned_count, conflicted_count, considered_count,
        relevance, confidence, alignment_score,
        rationale, cited_bills_json, procedural_excluded,
        computed_at, source_adapter_id, source_tier)
     VALUES
       (@rep_id, @hash, @issue,
        @aligned, @conflicted, @considered,
        @relevance, @confidence, @alignment_score,
        @rationale, @cited, @procedural_excluded,
        @computed_at, @adapter_id, @tier)
     ON CONFLICT(rep_id, stance_snapshot_hash, issue) DO UPDATE SET
       aligned_count       = excluded.aligned_count,
       conflicted_count    = excluded.conflicted_count,
       considered_count    = excluded.considered_count,
       relevance           = excluded.relevance,
       confidence          = excluded.confidence,
       alignment_score     = excluded.alignment_score,
       rationale           = excluded.rationale,
       cited_bills_json    = excluded.cited_bills_json,
       procedural_excluded = excluded.procedural_excluded,
       computed_at         = excluded.computed_at,
       source_adapter_id   = excluded.source_adapter_id,
       source_tier         = excluded.source_tier`,
  );

  const now = Date.now();
  db.transaction(() => {
    for (const row of perIssue) {
      upsert.run({
        rep_id: rep.id,
        hash: stanceSnapshotHash,
        issue: row.issue,
        aligned: row.alignedCount,
        conflicted: row.conflictedCount,
        considered: row.consideredCount,
        relevance: row.relevance,
        confidence: row.confidence,
        alignment_score: row.alignmentScore,
        rationale: row.rationale,
        cited: JSON.stringify(row.citedBills),
        procedural_excluded: proceduralExcluded ? 1 : 0,
        computed_at: now,
        adapter_id: rep.sourceAdapterId,
        tier: rep.sourceTier,
      });
    }
  })();
}

/**
 * Stance snapshot hash for rep scoring. Must be deterministic and stable
 * across calls so a re-score under an unchanged stance set updates the same
 * `rep_scores` row rather than inserting a duplicate. Mirrors the bill-score
 * hash convention (sorted by issue, sha256, truncated to 16 chars).
 */
export function hashStancesForRepScoring(stances: readonly IssueStance[]): string {
  const normalized = [...stances]
    .map((s) => ({ issue: s.issue, stance: s.stance, weight: s.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

export type StoredRepScore = {
  repId: string;
  stanceSnapshotHash: string;
  issue: string;
  alignedCount: number;
  conflictedCount: number;
  consideredCount: number;
  relevance: number;
  confidence: number;
  alignmentScore: number;
  rationale: string;
  citedBills: { billId: string; voteId: string; outcome: "aligned" | "conflicted"; relevance: number }[];
  proceduralExcluded: boolean;
  computedAt: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export function readStoredRepScores(
  db: PolitiClawDb,
  repId: string,
  stanceSnapshotHash: string,
): StoredRepScore[] {
  const rows = db
    .prepare(
      `SELECT rep_id, stance_snapshot_hash, issue,
              aligned_count, conflicted_count, considered_count,
              relevance, confidence, alignment_score,
              rationale, cited_bills_json, procedural_excluded,
              computed_at, source_adapter_id, source_tier
         FROM rep_scores
        WHERE rep_id = @rep_id AND stance_snapshot_hash = @hash
        ORDER BY issue`,
    )
    .all({ rep_id: repId, hash: stanceSnapshotHash }) as Array<{
    rep_id: string;
    stance_snapshot_hash: string;
    issue: string;
    aligned_count: number;
    conflicted_count: number;
    considered_count: number;
    relevance: number;
    confidence: number;
    alignment_score: number;
    rationale: string;
    cited_bills_json: string;
    procedural_excluded: number;
    computed_at: number;
    source_adapter_id: string;
    source_tier: number;
  }>;
  return rows.map((row) => ({
    repId: row.rep_id,
    stanceSnapshotHash: row.stance_snapshot_hash,
    issue: row.issue,
    alignedCount: row.aligned_count,
    conflictedCount: row.conflicted_count,
    consideredCount: row.considered_count,
    relevance: row.relevance,
    confidence: row.confidence,
    alignmentScore: row.alignment_score,
    rationale: row.rationale,
    citedBills: JSON.parse(row.cited_bills_json) as StoredRepScore["citedBills"],
    proceduralExcluded: row.procedural_excluded === 1,
    computedAt: row.computed_at,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  }));
}

export function readStoredAlignment(
  db: PolitiClawDb,
  billId: string,
  stanceSnapshotHash: string,
): StoredAlignment | null {
  const row = db
    .prepare(
      `SELECT bill_id, stance_snapshot_hash, relevance, confidence, matched_json,
              rationale, computed_at, source_adapter_id, source_tier
         FROM bill_alignment
         WHERE bill_id = @bill_id AND stance_snapshot_hash = @hash`,
    )
    .get({ bill_id: billId, hash: stanceSnapshotHash }) as
    | {
        bill_id: string;
        stance_snapshot_hash: string;
        relevance: number;
        confidence: number;
        matched_json: string;
        rationale: string;
        computed_at: number;
        source_adapter_id: string;
        source_tier: number;
      }
    | undefined;
  if (!row) return null;
  return {
    billId: row.bill_id,
    stanceSnapshotHash: row.stance_snapshot_hash,
    relevance: row.relevance,
    confidence: row.confidence,
    matches: JSON.parse(row.matched_json) as StanceMatch[],
    rationale: row.rationale,
    computedAt: row.computed_at,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}
