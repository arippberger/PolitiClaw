import type { IssueStance } from "../preferences/types.js";
import { CONFIDENCE_FLOOR } from "./alignment.js";

export { CONFIDENCE_FLOOR };

/**
 * One atomic input row for rep-alignment computation:
 *   "user declared `issue` at `stance`/`stanceWeight`;
 *    they signalled `userDirection` on `billId` (weight `userSignalWeight`);
 *    bill_alignment said this bill's `relevance` for this issue;
 *    rep voted `repPosition` on `voteId` (procedural=`isProcedural`)."
 *
 * The primitive is DB-free: the domain layer assembles these rows via SQL
 * joins across `issue_stances` × `stance_signals` × `bill_alignment` ×
 * `member_votes`, then hands the primitive a flat list. One bill can appear
 * multiple times when it touches multiple issues.
 */
export type BillEvidence = {
  billId: string;
  issue: string;
  stance: IssueStance["stance"];
  stanceWeight: number;
  relevance: number;
  userDirection: "agree" | "disagree";
  userSignalWeight: number;
  repPosition: "Yea" | "Nay" | "Present" | "Not Voting";
  isProcedural: boolean | null;
  voteId: string;
};

export type RepAlignmentOptions = {
  /**
   * When true, procedural votes (motions-to-adjourn, previous-question, etc.)
   * are filtered out before tallying. The exclusion is the safer default:
   * inferring substantive alignment from a procedural motion is misleading.
   * `is_procedural = NULL` (classification pending) is also filtered when
   * `excludeProcedural` is true.
   */
  excludeProcedural: boolean;
};

export type CitedBill = {
  billId: string;
  voteId: string;
  outcome: "aligned" | "conflicted";
  relevance: number;
};

export type RepIssueAlignment = {
  issue: string;
  stance: IssueStance["stance"];
  stanceWeight: number;
  /** User's free-text paraphrase of the specific concern within this issue bucket, when present. */
  note?: string;
  alignedCount: number;
  conflictedCount: number;
  consideredCount: number;
  /** Average of `relevance` values across counted (non-neutral, non-procedural) bills. */
  relevance: number;
  confidence: number;
  /** Weighted alignment: sum(aligned_weight) / sum(aligned_weight + conflicted_weight). */
  alignmentScore: number;
  belowConfidenceFloor: boolean;
  rationale: string;
  citedBills: CitedBill[];
};

export type RepAlignmentResult = {
  perIssue: RepIssueAlignment[];
  /** Votes that contributed to at least one issue's tally. */
  consideredVoteCount: number;
  /** Votes dropped because they were procedural (or NULL when excludeProcedural=true). */
  skippedProceduralCount: number;
  /** Votes where rep abstained (Present / Not Voting). Excluded from tallies either way. */
  skippedNeutralPositionCount: number;
  proceduralExcluded: boolean;
};

/**
 * Deterministic per-issue rep alignment. No LLM involved — we compose:
 *
 *   - `bill_alignment.relevance` (how strongly a bill touches an issue),
 *   - the user's own `stance_signals` (which way they would vote on the bill),
 *   - the rep's `member_votes.position` (how the rep actually voted),
 *
 * and count weighted matches vs. mismatches per issue. Direction ("would a
 * YES on HR-X advance the user's stance?") comes exclusively from the user's
 * explicit signal; we never infer it from LLM judgment.
 *
 * Issues with no available evidence surface as `belowConfidenceFloor=true` so
 * the tool renders "insufficient data" rather than a misleading 0% or 100%.
 */
export function computeRepAlignment(
  stances: readonly IssueStance[],
  evidence: readonly BillEvidence[],
  options: RepAlignmentOptions,
): RepAlignmentResult {
  const activeStances = stances.filter((stance) => stance.stance !== "neutral");

  const filtered: BillEvidence[] = [];
  let skippedProceduralCount = 0;
  let skippedNeutralPositionCount = 0;
  for (const row of evidence) {
    if (options.excludeProcedural && row.isProcedural !== false) {
      // Excludes rows with `is_procedural = true` AND `is_procedural = NULL`
      // (classification pending): unknown stays excluded by default.
      skippedProceduralCount += 1;
      continue;
    }
    if (row.repPosition === "Present" || row.repPosition === "Not Voting") {
      skippedNeutralPositionCount += 1;
      continue;
    }
    filtered.push(row);
  }

  const evidenceByIssue = new Map<string, BillEvidence[]>();
  for (const row of filtered) {
    const bucket = evidenceByIssue.get(row.issue);
    if (bucket) bucket.push(row);
    else evidenceByIssue.set(row.issue, [row]);
  }

  const consideredVoteIds = new Set<string>();
  for (const row of filtered) consideredVoteIds.add(row.voteId);

  const perIssue: RepIssueAlignment[] = [];
  for (const stance of activeStances) {
    perIssue.push(
      scoreSingleIssue(stance, evidenceByIssue.get(stance.issue) ?? []),
    );
  }

  return {
    perIssue,
    consideredVoteCount: consideredVoteIds.size,
    skippedProceduralCount,
    skippedNeutralPositionCount,
    proceduralExcluded: options.excludeProcedural,
  };
}

function scoreSingleIssue(
  stance: IssueStance,
  rows: readonly BillEvidence[],
): RepIssueAlignment {
  if (rows.length === 0) {
    return buildEmptyIssue(stance, "no bills in recent vote history touched this issue with a recorded user signal");
  }

  let alignedWeight = 0;
  let conflictedWeight = 0;
  let alignedCount = 0;
  let conflictedCount = 0;
  let relevanceSum = 0;
  const citedBills: CitedBill[] = [];

  for (const row of rows) {
    const rowWeight = row.relevance * row.stanceWeight * row.userSignalWeight;
    const userImpliedPosition: "Yea" | "Nay" =
      row.userDirection === "agree" ? "Yea" : "Nay";
    const outcome: "aligned" | "conflicted" =
      row.repPosition === userImpliedPosition ? "aligned" : "conflicted";

    relevanceSum += row.relevance;
    if (outcome === "aligned") {
      alignedWeight += rowWeight;
      alignedCount += 1;
    } else {
      conflictedWeight += rowWeight;
      conflictedCount += 1;
    }
    citedBills.push({
      billId: row.billId,
      voteId: row.voteId,
      outcome,
      relevance: row.relevance,
    });
  }

  const consideredCount = alignedCount + conflictedCount;
  const totalWeight = alignedWeight + conflictedWeight;
  const alignmentScore = totalWeight > 0 ? alignedWeight / totalWeight : 0;
  const avgRelevance = relevanceSum / consideredCount;

  const confidence = computeIssueConfidence(consideredCount, avgRelevance);
  const belowFloor = confidence < CONFIDENCE_FLOOR;

  const rationale = buildRationale(stance, alignedCount, conflictedCount, citedBills, belowFloor);

  return {
    issue: stance.issue,
    stance: stance.stance,
    stanceWeight: stance.weight,
    ...(stance.note ? { note: stance.note } : {}),
    alignedCount,
    conflictedCount,
    consideredCount,
    relevance: clamp01(avgRelevance),
    confidence,
    alignmentScore: clamp01(alignmentScore),
    belowConfidenceFloor: belowFloor,
    rationale,
    citedBills,
  };
}

function buildEmptyIssue(stance: IssueStance, reason: string): RepIssueAlignment {
  return {
    issue: stance.issue,
    stance: stance.stance,
    stanceWeight: stance.weight,
    ...(stance.note ? { note: stance.note } : {}),
    alignedCount: 0,
    conflictedCount: 0,
    consideredCount: 0,
    relevance: 0,
    confidence: 0,
    alignmentScore: 0,
    belowConfidenceFloor: true,
    rationale: `Insufficient data for ${stance.issue}: ${reason}.`,
    citedBills: [],
  };
}

function computeIssueConfidence(consideredCount: number, avgRelevance: number): number {
  // A single vote is noise — below floor by construction so scoring surfaces
  // "insufficient data" rather than a headline "100% aligned on one bill."
  if (consideredCount === 0) return 0;
  if (consideredCount < 2) return 0.2;

  // Base recognises this is tier-1 vote data (stronger starting point than
  // bill alignment's 0.2 floor on no-match). Each additional considered bill
  // adds a decaying contribution, capped so we don't claim certainty from
  // a dozen low-relevance matches.
  const base = 0.4;
  const countContribution = Math.min(0.3, (consideredCount - 2) * 0.05 + 0.05);
  const relevanceContribution = Math.min(0.25, avgRelevance * 0.25);

  return Math.min(1, Number((base + countContribution + relevanceContribution).toFixed(3)));
}

function buildRationale(
  stance: IssueStance,
  alignedCount: number,
  conflictedCount: number,
  citedBills: readonly CitedBill[],
  belowFloor: boolean,
): string {
  const stanceWord = stance.stance === "support" ? "support" : "opposition";
  const considered = alignedCount + conflictedCount;

  if (considered === 0) {
    return `No rep votes counted for ${stance.issue} after filtering.`;
  }

  const alignedBills = citedBills.filter((b) => b.outcome === "aligned").map((b) => b.billId);
  const conflictedBills = citedBills.filter((b) => b.outcome === "conflicted").map((b) => b.billId);

  const alignedPhrase =
    alignedBills.length > 0 ? `aligned on ${alignedBills.join(", ")}` : "no aligned votes";
  const conflictedPhrase =
    conflictedBills.length > 0 ? `conflicted on ${conflictedBills.join(", ")}` : "no conflicted votes";

  const prefix = belowFloor
    ? `Insufficient data for ${stance.issue} (${considered} counted vote${considered === 1 ? "" : "s"})`
    : `For ${stance.issue} (${stanceWord}, weight ${stance.weight}): ${considered} counted votes`;

  return `${prefix}; ${alignedPhrase}; ${conflictedPhrase}.`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
