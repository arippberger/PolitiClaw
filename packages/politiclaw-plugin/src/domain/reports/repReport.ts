import type { PolitiClawDb } from "../../storage/sqlite.js";
import { listIssueStances } from "../preferences/index.js";
import type { StoredRep } from "../reps/index.js";
import { listReps } from "../reps/index.js";
import {
  hashStancesForRepScoring,
  scoreRepresentative,
  type ScoreRepresentativeOptions,
  type ScoreRepresentativeResult,
} from "../scoring/index.js";

export type RepReportRow = {
  rep: StoredRep;
  result: ScoreRepresentativeResult;
};

export type GenerateRepReportResult =
  | { status: "no_stances"; reason: string; actionable: string }
  | { status: "no_reps"; reason: string; actionable: string }
  | {
      /** Same hash `scoreRepresentative` uses for the current `issue_stances` rows — not derived from per-rep outcomes. */
      status: "ok";
      stanceSnapshotHash: string;
      rows: RepReportRow[];
    };

/**
 * Re-scores every stored representative and assembles a multi-rep report row
 * set. Each row is a `scoreRepresentative` result; persistence is a side
 * effect of that call.
 */
export function generateRepReport(
  db: PolitiClawDb,
  options: ScoreRepresentativeOptions = {},
): GenerateRepReportResult {
  const stanceRows = listIssueStances(db);
  if (stanceRows.length === 0) {
    return {
      status: "no_stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_issue_stances with action='set' before generating a rep report",
    };
  }

  const representatives = listReps(db);
  if (representatives.length === 0) {
    return {
      status: "no_reps",
      reason: "no representatives stored",
      actionable: "call politiclaw_get_my_reps first",
    };
  }

  const stanceSnapshotHash = hashStancesForRepScoring(
    stanceRows.map((row) => ({
      issue: row.issue,
      stance: row.stance,
      weight: row.weight,
    })),
  );

  const rows: RepReportRow[] = [];
  for (const rep of representatives) {
    const result = scoreRepresentative(db, rep.id, options);
    rows.push({ rep, result });
  }

  return { status: "ok", stanceSnapshotHash, rows };
}
