import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  PATTERN_ALIGNED_MIN,
  PATTERN_CONCERNING_MAX,
  PATTERN_CONCERNING_MIN_WEIGHT,
  scoreRepresentative,
  type RepIssueAlignment,
  type ScoreRepresentativeResult,
} from "../domain/scoring/index.js";
import type { StoredRep } from "../domain/reps/index.js";
import { congressGovPublicBillUrl } from "../sources/bills/types.js";
import { getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const ScoreRepresentativeParams = Type.Object({
  repId: Type.String({
    minLength: 1,
    description:
      "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
  }),
  includeProcedural: Type.Optional(
    Type.Boolean({
      description:
        "When true, procedural roll calls (motions-to-adjourn, previous-question, etc.) are INCLUDED in the tally. Default is false.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export type RepPattern = "aligned" | "mixed" | "concerning" | "insufficient_data";

/**
 * Deterministic 3-band accountability pattern for a rep, plus an
 * `insufficient_data` fallback. Below-floor issues are never considered —
 * they cannot push a rep into `concerning` and they cannot keep a rep out
 * of `aligned`. If every issue is below the floor, returns
 * `insufficient_data` so callers can suppress the pattern label entirely.
 */
export function computeRepPattern(perIssue: readonly RepIssueAlignment[]): RepPattern {
  const above = perIssue.filter((issue) => !issue.belowConfidenceFloor);
  if (above.length === 0) return "insufficient_data";

  const concerningIssue = above.some(
    (issue) =>
      issue.alignmentScore < PATTERN_CONCERNING_MAX &&
      issue.stanceWeight >= PATTERN_CONCERNING_MIN_WEIGHT,
  );
  if (concerningIssue) return "concerning";

  const allAligned = above.every((issue) => issue.alignmentScore >= PATTERN_ALIGNED_MIN);
  if (allAligned) return "aligned";

  return "mixed";
}

/**
 * Render a rep-score result as text. Enforces the scoring output rules:
 *   - confidence below the 0.4 floor renders as "insufficient data"
 *   - the ALIGNMENT_DISCLAIMER appears verbatim whenever any numeric score
 *     is emitted
 *   - missing direction signals / missing vote coverage surface explicitly;
 *     silence would let the user mistake "we have no data" for "rep is bad."
 */
export function renderScoreRepresentativeOutput(
  result: ScoreRepresentativeResult,
): string {
  if (result.status === "rep_not_found") {
    return `Cannot score: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "no_stances") {
    return `Cannot score: ${result.reason}. ${result.actionable}.`;
  }

  const {
    rep,
    perIssue,
    consideredVoteCount,
    skippedProceduralCount,
    missingSignalBillCount,
    billsWithoutRepVotes,
    proceduralExcluded,
  } = result;

  const officeLabel = describeOffice(rep);
  const baseHeader = `Representative ${rep.name} (${officeLabel}) — did they represent your stances?`;
  const provenance = `Source: ${rep.sourceAdapterId} (tier ${rep.sourceTier}).`;

  const pattern = computeRepPattern(perIssue);
  const allBelowFloor = perIssue.every((issue) => issue.belowConfidenceFloor);
  const summaryLine = buildSummaryLine({
    consideredVoteCount,
    skippedProceduralCount,
    missingSignalBillCount,
    billsWithoutRepVotes,
    proceduralExcluded,
  });

  if (perIssue.length === 0 || allBelowFloor || pattern === "insufficient_data") {
    return [
      baseHeader,
      provenance,
      "Pattern: insufficient data (confidence below floor for every declared issue).",
      summaryLine,
      ...buildCoverageHints({
        consideredVoteCount,
        missingSignalBillCount,
        billsWithoutRepVotes,
      }),
      "",
      ALIGNMENT_DISCLAIMER,
    ].join("\n");
  }

  const header = `${baseHeader} — pattern: ${pattern}`;

  const issueLines: string[] = [];
  for (const issue of perIssue) {
    issueLines.push(renderIssueLine(issue));
    if (issue.citedBills.length > 0 && !issue.belowConfidenceFloor) {
      const aligned = issue.citedBills
        .filter((b) => b.outcome === "aligned")
        .map((b) => formatBillCitation(b.billId));
      const conflicted = issue.citedBills
        .filter((b) => b.outcome === "conflicted")
        .map((b) => formatBillCitation(b.billId));
      if (aligned.length > 0) issueLines.push(`    aligned on: ${aligned.join(", ")}`);
      if (conflicted.length > 0) issueLines.push(`    conflicted on: ${conflicted.join(", ")}`);
    }
  }

  return [
    header,
    provenance,
    summaryLine,
    "",
    "Your priorities this rep acted on:",
    ...issueLines,
    "",
    ALIGNMENT_DISCLAIMER,
  ].join("\n");
}

function formatBillCitation(billId: string): string {
  const url = congressGovPublicBillUrl(billId);
  return url ? `[${billId}](${url})` : billId;
}

function renderIssueLine(issue: RepIssueAlignment): string {
  const stanceWord = issue.stance === "support" ? "support" : "opposition";
  const noteSuffix = issue.note ? ` — your note: ${issue.note}` : "";
  if (issue.belowConfidenceFloor) {
    return `  • ${issue.issue} (${stanceWord}, weight ${issue.stanceWeight})${noteSuffix}: insufficient data — ${issue.rationale}`;
  }
  const alignmentPct = Math.round(issue.alignmentScore * 100);
  const confidencePct = Math.round(issue.confidence * 100);
  return `  • ${issue.issue} (${stanceWord}, weight ${issue.stanceWeight})${noteSuffix}: ${alignmentPct}% aligned across ${issue.consideredCount} vote${
    issue.consideredCount === 1 ? "" : "s"
  } (confidence ${confidencePct}%).`;
}

type SummaryInputs = {
  consideredVoteCount: number;
  skippedProceduralCount: number;
  missingSignalBillCount: number;
  billsWithoutRepVotes: number;
  proceduralExcluded: boolean;
};

function buildSummaryLine(inputs: SummaryInputs): string {
  const parts: string[] = [];
  parts.push(
    `${inputs.consideredVoteCount} counted vote${inputs.consideredVoteCount === 1 ? "" : "s"} across issues`,
  );
  if (inputs.proceduralExcluded && inputs.skippedProceduralCount > 0) {
    parts.push(
      `${inputs.skippedProceduralCount} procedural/unclassified vote${
        inputs.skippedProceduralCount === 1 ? "" : "s"
      } excluded by default`,
    );
  } else if (!inputs.proceduralExcluded) {
    parts.push("procedural votes included (opt-in)");
  }
  return `Coverage: ${parts.join("; ")}.`;
}

function buildCoverageHints(inputs: {
  consideredVoteCount: number;
  missingSignalBillCount: number;
  billsWithoutRepVotes: number;
}): string[] {
  const hints: string[] = [];
  if (inputs.missingSignalBillCount > 0) {
    hints.push(
      `  • ${inputs.missingSignalBillCount} bill${
        inputs.missingSignalBillCount === 1 ? "" : "s"
      } matched your issues but have no recorded stance signal — use politiclaw_record_stance_signal (with billId + agree/disagree) to unlock direction.`,
    );
  }
  if (inputs.billsWithoutRepVotes > 0) {
    hints.push(
      `  • ${inputs.billsWithoutRepVotes} bill${
        inputs.billsWithoutRepVotes === 1 ? "" : "s"
      } had a recorded stance signal but no matching roll-call for this rep.`,
    );
  }
  if (inputs.consideredVoteCount === 0) {
    hints.push(
      "  • Call politiclaw_ingest_votes first to populate roll-call data, then politiclaw_score_bill on bills you have signals for.",
    );
  }
  return hints;
}

function describeOffice(rep: StoredRep): string {
  if (rep.office === "US House" && rep.district) return `US House, ${rep.state}-${rep.district}`;
  if (rep.state) return `${rep.office}, ${rep.state}`;
  return rep.office;
}

export const scoreRepresentativeTool: AnyAgentTool = {
  name: "politiclaw_score_representative",
  label: "Did this representative represent the stances you declared?",
  description:
    "Measure the gap between a rep's actual federal voting record and the stances the user declared — " +
    "per issue — so the user can see where this rep represents them and where they don't. " +
    "Returns a 3-band pattern label (aligned / mixed / concerning), or 'insufficient data' when " +
    "confidence is too low to classify. " +
    "Computation is deterministic (no LLM); direction comes exclusively from the user's explicit " +
    "stance signals on bills, so the rep's record is counted, not narrated. Confidence below the " +
    `${CONFIDENCE_FLOOR} floor renders as "insufficient data". ` +
    "Procedural motions are excluded by default; pass includeProcedural=true " +
    "for the raw tally. House votes come from api.congress.gov (tier 1) and Senate " +
    "votes come from voteview.com (tier 2, zero-key); a senator will only show " +
    '"insufficient data" if politiclaw_ingest_votes has not been run for the Senate yet.',
  parameters: ScoreRepresentativeParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ScoreRepresentativeParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const result = scoreRepresentative(db, parsed.data.repId, {
      excludeProcedural: parsed.data.includeProcedural !== true,
    });
    return textResult(renderScoreRepresentativeOutput(result), result);
  },
};

export const repScoringTools: AnyAgentTool[] = [scoreRepresentativeTool];
