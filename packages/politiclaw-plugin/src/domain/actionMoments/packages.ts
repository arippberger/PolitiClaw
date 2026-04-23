import type { PolitiClawDb } from "../../storage/sqlite.js";
import type {
  ActionPackageKind,
  ActionPackageRow,
  OutreachMode,
  PackageStatus,
  TriggerClass,
} from "./types.js";

export type CreateActionPackageInput = {
  triggerClass: TriggerClass;
  packageKind: ActionPackageKind;
  outreachMode?: OutreachMode | null;
  billId?: string | null;
  repId?: string | null;
  issue?: string | null;
  electionDate?: string | null;
  decisionHash: string;
  summary: string;
  sourceAdapterId: string;
  sourceTier: number;
  now?: number;
};

type RawActionPackageRow = {
  id: number;
  created_at: number;
  trigger_class: TriggerClass;
  package_kind: ActionPackageKind;
  outreach_mode: OutreachMode | null;
  bill_id: string | null;
  rep_id: string | null;
  issue: string | null;
  election_date: string | null;
  decision_hash: string;
  summary: string;
  status: PackageStatus;
  status_at: number;
  generated_letter_id: number | null;
  generated_call_script_id: number | null;
  generated_reminder_id: number | null;
  source_adapter_id: string;
  source_tier: number;
};

function hydrate(row: RawActionPackageRow): ActionPackageRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    triggerClass: row.trigger_class,
    packageKind: row.package_kind,
    outreachMode: row.outreach_mode,
    billId: row.bill_id,
    repId: row.rep_id,
    issue: row.issue,
    electionDate: row.election_date,
    decisionHash: row.decision_hash,
    summary: row.summary,
    status: row.status,
    statusAt: row.status_at,
    generatedLetterId: row.generated_letter_id,
    generatedCallScriptId: row.generated_call_script_id,
    generatedReminderId: row.generated_reminder_id,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}

/**
 * Insert or return an existing row on the `(trigger_class, target tuple,
 * decision_hash)` unique index. If a prior package with the same identity
 * already exists (in any status) we do nothing and return it — re-running
 * the check-upcoming-votes loop on identical state must not re-offer the
 * same package or flip it out of `stopped` / `dismissed`.
 */
export function createActionPackage(
  db: PolitiClawDb,
  input: CreateActionPackageInput,
): ActionPackageRow {
  const now = input.now ?? Date.now();
  const existing = findByDecisionTuple(db, input);
  if (existing) return existing;

  const result = db
    .prepare(
      `INSERT INTO action_packages (
         created_at, trigger_class, package_kind, outreach_mode,
         bill_id, rep_id, issue, election_date, decision_hash,
         summary, status, status_at,
         source_adapter_id, source_tier
       ) VALUES (
         @created_at, @trigger_class, @package_kind, @outreach_mode,
         @bill_id, @rep_id, @issue, @election_date, @decision_hash,
         @summary, 'open', @status_at,
         @source_adapter_id, @source_tier
       )`,
    )
    .run({
      created_at: now,
      trigger_class: input.triggerClass,
      package_kind: input.packageKind,
      outreach_mode: input.outreachMode ?? null,
      bill_id: input.billId ?? null,
      rep_id: input.repId ?? null,
      issue: input.issue ?? null,
      election_date: input.electionDate ?? null,
      decision_hash: input.decisionHash,
      summary: input.summary,
      status_at: now,
      source_adapter_id: input.sourceAdapterId,
      source_tier: input.sourceTier,
    });
  const id = Number(result.lastInsertRowid);
  return getActionPackage(db, id)!;
}

export function getActionPackage(
  db: PolitiClawDb,
  id: number,
): ActionPackageRow | null {
  const row = db
    .prepare(`SELECT * FROM action_packages WHERE id = ?`)
    .get(id) as RawActionPackageRow | undefined;
  return row ? hydrate(row) : null;
}

function findByDecisionTuple(
  db: PolitiClawDb,
  input: CreateActionPackageInput,
): ActionPackageRow | null {
  const row = db
    .prepare(
      `SELECT * FROM action_packages
        WHERE trigger_class = @trigger_class
          AND bill_id IS @bill_id
          AND rep_id IS @rep_id
          AND issue IS @issue
          AND election_date IS @election_date
          AND decision_hash = @decision_hash`,
    )
    .get({
      trigger_class: input.triggerClass,
      bill_id: input.billId ?? null,
      rep_id: input.repId ?? null,
      issue: input.issue ?? null,
      election_date: input.electionDate ?? null,
      decision_hash: input.decisionHash,
    }) as RawActionPackageRow | undefined;
  return row ? hydrate(row) : null;
}

export type ListOpenOptions = {
  limit?: number;
};

export function listOpenActionPackages(
  db: PolitiClawDb,
  opts: ListOpenOptions = {},
): ActionPackageRow[] {
  const limit = opts.limit ?? 25;
  const rows = db
    .prepare(
      `SELECT * FROM action_packages
        WHERE status = 'open'
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(limit) as RawActionPackageRow[];
  return rows.map(hydrate);
}

export function listActionPackagesCreatedSince(
  db: PolitiClawDb,
  sinceMs: number,
): ActionPackageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM action_packages
        WHERE created_at >= ?
        ORDER BY created_at DESC`,
    )
    .all(sinceMs) as RawActionPackageRow[];
  return rows.map(hydrate);
}

export function listOpenActionPackagesForRep(
  db: PolitiClawDb,
  repId: string,
): ActionPackageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM action_packages
        WHERE status = 'open' AND rep_id = ?
        ORDER BY created_at DESC`,
    )
    .all(repId) as RawActionPackageRow[];
  return rows.map(hydrate);
}

/**
 * One-way status transitions. Packages can only leave `open`, never
 * return to it. This matches how users think about an offer: "I used it",
 * "I'm not interested", "don't offer it again" — none of those are
 * reversible by design.
 */
export function setPackageStatus(
  db: PolitiClawDb,
  id: number,
  status: Exclude<PackageStatus, "open">,
  now: number = Date.now(),
): ActionPackageRow | null {
  const result = db
    .prepare(
      `UPDATE action_packages
         SET status = @status, status_at = @now
         WHERE id = @id AND status = 'open'`,
    )
    .run({ id, status, now });
  if (result.changes === 0) return getActionPackage(db, id);
  return getActionPackage(db, id);
}

export function attachGeneratedLetter(
  db: PolitiClawDb,
  id: number,
  letterId: number,
  now: number = Date.now(),
): ActionPackageRow | null {
  db.prepare(
    `UPDATE action_packages
       SET generated_letter_id = @letter,
           status = CASE WHEN status = 'open' THEN 'used' ELSE status END,
           status_at = CASE WHEN status = 'open' THEN @now ELSE status_at END
       WHERE id = @id`,
  ).run({ letter: letterId, now, id });
  return getActionPackage(db, id);
}

export function attachGeneratedCallScript(
  db: PolitiClawDb,
  id: number,
  callScriptId: number,
  now: number = Date.now(),
): ActionPackageRow | null {
  db.prepare(
    `UPDATE action_packages
       SET generated_call_script_id = @cs,
           status = CASE WHEN status = 'open' THEN 'used' ELSE status END,
           status_at = CASE WHEN status = 'open' THEN @now ELSE status_at END
       WHERE id = @id`,
  ).run({ cs: callScriptId, now, id });
  return getActionPackage(db, id);
}

export function attachGeneratedReminder(
  db: PolitiClawDb,
  id: number,
  reminderId: number,
  now: number = Date.now(),
): ActionPackageRow | null {
  db.prepare(
    `UPDATE action_packages
       SET generated_reminder_id = @rid,
           status = CASE WHEN status = 'open' THEN 'used' ELSE status END,
           status_at = CASE WHEN status = 'open' THEN @now ELSE status_at END
       WHERE id = @id`,
  ).run({ rid: reminderId, now, id });
  return getActionPackage(db, id);
}

/**
 * Flip `open → expired` for rows whose anchor has passed. "Anchor passed"
 * means: the event's startDateTime is in the past, the electionDate is
 * past, or (for bill-based packages) the linked reminder's deadline is
 * past. Bill packages without an explicit deadline stay open — the bill
 * might be scheduled next week.
 */
export function sweepExpired(
  db: PolitiClawDb,
  now: number = Date.now(),
): number {
  const nowIso = new Date(now).toISOString();
  const result = db
    .prepare(
      `UPDATE action_packages
         SET status = 'expired', status_at = @now
         WHERE status = 'open'
           AND election_date IS NOT NULL
           AND election_date < @today`,
    )
    .run({ now, today: nowIso.slice(0, 10) });
  return result.changes as number;
}

/**
 * Target tuple for filtering: nulls match nulls.
 */
export function findOpenByTarget(
  db: PolitiClawDb,
  triggerClass: TriggerClass,
  billId: string | null,
  repId: string | null,
  issue: string | null,
): ActionPackageRow[] {
  const rows = db
    .prepare(
      `SELECT * FROM action_packages
        WHERE status = 'open'
          AND trigger_class = @trigger_class
          AND bill_id IS @bill_id
          AND rep_id IS @rep_id
          AND issue IS @issue
        ORDER BY created_at DESC`,
    )
    .all({
      trigger_class: triggerClass,
      bill_id: billId,
      rep_id: repId,
      issue,
    }) as RawActionPackageRow[];
  return rows.map(hydrate);
}
