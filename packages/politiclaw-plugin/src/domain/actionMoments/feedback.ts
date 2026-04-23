import type { PolitiClawDb } from "../../storage/sqlite.js";
import {
  getActionPackage,
  setPackageStatus,
} from "./packages.js";
import type {
  ActionPackageFeedbackRow,
  ActionPackageRow,
  PackageFeedbackVerdict,
  TriggerClass,
} from "./types.js";

export type RecordPackageFeedbackInput = {
  packageId: number;
  verdict: PackageFeedbackVerdict;
  note?: string;
  now?: number;
};

export type RecordPackageFeedbackResult =
  | {
      status: "ok";
      package: ActionPackageRow;
      feedbackId: number;
    }
  | { status: "not_found"; reason: string };

/**
 * Append a feedback row and apply the verdict's status effect:
 *   - useful  → status 'used'
 *   - stop    → status 'stopped' (suppresses future packages with the same
 *               trigger + target tuple via listStopTuples())
 *   - not_now → status stays 'open'; cooldown is enforced in propose.ts
 *               by reading recent not_now feedback
 *
 * Feedback is append-only. A user can record `not_now` multiple times
 * without losing the ability to later record `useful` or `stop`.
 */
export function recordPackageFeedback(
  db: PolitiClawDb,
  input: RecordPackageFeedbackInput,
): RecordPackageFeedbackResult {
  const pkg = getActionPackage(db, input.packageId);
  if (!pkg) {
    return { status: "not_found", reason: `No action package with id ${input.packageId}.` };
  }
  const now = input.now ?? Date.now();
  const result = db
    .prepare(
      `INSERT INTO action_package_feedback (package_id, created_at, verdict, note)
       VALUES (@package_id, @created_at, @verdict, @note)`,
    )
    .run({
      package_id: input.packageId,
      created_at: now,
      verdict: input.verdict,
      note: input.note ?? null,
    });
  const feedbackId = Number(result.lastInsertRowid);

  let updatedPkg = pkg;
  if (input.verdict === "useful") {
    updatedPkg = setPackageStatus(db, input.packageId, "used", now) ?? pkg;
  } else if (input.verdict === "stop") {
    updatedPkg = setPackageStatus(db, input.packageId, "stopped", now) ?? pkg;
  }

  return { status: "ok", package: updatedPkg, feedbackId };
}

export type StopTuple = {
  triggerClass: TriggerClass;
  billId: string | null;
  repId: string | null;
  issue: string | null;
  electionDate: string | null;
};

/**
 * Every `(trigger_class, target tuple)` the user has told us to stop
 * offering. Used by propose.ts to filter out candidates that match an
 * already-stopped tuple. Nulls match nulls on read.
 */
export function listStopTuples(db: PolitiClawDb): StopTuple[] {
  const rows = db
    .prepare(
      `SELECT DISTINCT ap.trigger_class, ap.bill_id, ap.rep_id, ap.issue, ap.election_date
         FROM action_package_feedback f
         JOIN action_packages ap ON ap.id = f.package_id
        WHERE f.verdict = 'stop'`,
    )
    .all() as Array<{
    trigger_class: TriggerClass;
    bill_id: string | null;
    rep_id: string | null;
    issue: string | null;
    election_date: string | null;
  }>;
  return rows.map((r) => ({
    triggerClass: r.trigger_class,
    billId: r.bill_id,
    repId: r.rep_id,
    issue: r.issue,
    electionDate: r.election_date,
  }));
}

export type NotNowTuple = StopTuple & { mostRecentAt: number };

/**
 * Most recent `not_now` timestamp per tuple. Callers apply a 7-day
 * cooldown in propose.ts — it's cheaper and more explicit to filter in
 * TS than to encode the window in SQL.
 */
export function listNotNowTuples(db: PolitiClawDb): NotNowTuple[] {
  const rows = db
    .prepare(
      `SELECT ap.trigger_class, ap.bill_id, ap.rep_id, ap.issue, ap.election_date,
              MAX(f.created_at) AS most_recent
         FROM action_package_feedback f
         JOIN action_packages ap ON ap.id = f.package_id
        WHERE f.verdict = 'not_now'
        GROUP BY ap.trigger_class, ap.bill_id, ap.rep_id, ap.issue, ap.election_date`,
    )
    .all() as Array<{
    trigger_class: TriggerClass;
    bill_id: string | null;
    rep_id: string | null;
    issue: string | null;
    election_date: string | null;
    most_recent: number;
  }>;
  return rows.map((r) => ({
    triggerClass: r.trigger_class,
    billId: r.bill_id,
    repId: r.rep_id,
    issue: r.issue,
    electionDate: r.election_date,
    mostRecentAt: r.most_recent,
  }));
}

export function listFeedbackForPackage(
  db: PolitiClawDb,
  packageId: number,
): ActionPackageFeedbackRow[] {
  const rows = db
    .prepare(
      `SELECT id, package_id, created_at, verdict, note
         FROM action_package_feedback
        WHERE package_id = ?
        ORDER BY created_at DESC`,
    )
    .all(packageId) as Array<{
    id: number;
    package_id: number;
    created_at: number;
    verdict: PackageFeedbackVerdict;
    note: string | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    packageId: r.package_id,
    createdAt: r.created_at,
    verdict: r.verdict,
    note: r.note,
  }));
}
