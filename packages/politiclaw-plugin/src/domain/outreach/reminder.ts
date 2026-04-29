import type { PolitiClawDb } from "../../storage/sqlite.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type ReminderAnchor =
  | { kind: "bill"; billId: string }
  | { kind: "event"; eventId: string }
  | { kind: "election"; electionDate: string };

export type CreateReminderInput = {
  title: string;
  /** ISO-8601 date or date-time. */
  deadline?: string;
  anchor: ReminderAnchor;
  /** Additional user-supplied steps appended verbatim in order. */
  extraSteps?: string[];
};

export type ReminderRow = {
  id: number;
  title: string;
  deadline: string | null;
  anchorBillId: string | null;
  anchorEventId: string | null;
  anchorElectionDate: string | null;
  steps: string[];
  createdAt: number;
};

export type CreateReminderResult =
  | { status: "ok"; reminder: ReminderRow }
  | { status: "anchor_not_found"; reason: string };

export function createReminder(
  db: PolitiClawDb,
  input: CreateReminderInput,
  now: number = Date.now(),
): CreateReminderResult {
  const title = input.title.trim();
  if (!title) {
    return { status: "anchor_not_found", reason: "title is required" };
  }

  const anchorCheck = verifyAnchor(db, input.anchor);
  if (!anchorCheck.ok) {
    return { status: "anchor_not_found", reason: anchorCheck.reason };
  }

  const steps = buildSteps(input, anchorCheck.contextDate ?? input.deadline ?? null);

  const result = db
    .prepare(
      `INSERT INTO reminders (title, deadline, anchor_bill_id, anchor_event_id,
                              anchor_election_date, steps_json, created_at)
       VALUES (@title, @deadline, @bill_id, @event_id, @election_date, @steps, @now)`,
    )
    .run({
      title,
      deadline: input.deadline ?? null,
      bill_id: input.anchor.kind === "bill" ? input.anchor.billId : null,
      event_id: input.anchor.kind === "event" ? input.anchor.eventId : null,
      election_date: input.anchor.kind === "election" ? input.anchor.electionDate : null,
      steps: JSON.stringify(steps),
      now,
    });
  const id = Number(result.lastInsertRowid);
  const reminder = getReminder(db, id)!;
  return { status: "ok", reminder };
}

export function getReminder(db: PolitiClawDb, id: number): ReminderRow | null {
  const row = db
    .prepare(
      `SELECT id, title, deadline, anchor_bill_id, anchor_event_id,
              anchor_election_date, steps_json, created_at
         FROM reminders WHERE id = ?`,
    )
    .get(id) as
    | {
        id: number;
        title: string;
        deadline: string | null;
        anchor_bill_id: string | null;
        anchor_event_id: string | null;
        anchor_election_date: string | null;
        steps_json: string;
        created_at: number;
      }
    | undefined;
  if (!row) return null;
  return hydrate(row);
}

export function listReminders(db: PolitiClawDb, limit = 50): ReminderRow[] {
  const rows = db
    .prepare(
      `SELECT id, title, deadline, anchor_bill_id, anchor_event_id,
              anchor_election_date, steps_json, created_at
         FROM reminders ORDER BY COALESCE(deadline, '9999-99-99') ASC, created_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    title: string;
    deadline: string | null;
    anchor_bill_id: string | null;
    anchor_event_id: string | null;
    anchor_election_date: string | null;
    steps_json: string;
    created_at: number;
  }>;
  return rows.map(hydrate);
}

export function listDueReminders(
  db: PolitiClawDb,
  withinMs: number,
  now: number = Date.now(),
): ReminderRow[] {
  const windowIso = new Date(now + withinMs).toISOString();
  const rows = db
    .prepare(
      `SELECT id, title, deadline, anchor_bill_id, anchor_event_id,
              anchor_election_date, steps_json, created_at
         FROM reminders
        WHERE deadline IS NOT NULL
          AND deadline <= @window
        ORDER BY deadline ASC`,
    )
    .all({ window: windowIso }) as Array<{
    id: number;
    title: string;
    deadline: string | null;
    anchor_bill_id: string | null;
    anchor_event_id: string | null;
    anchor_election_date: string | null;
    steps_json: string;
    created_at: number;
  }>;
  return rows.map(hydrate);
}

function hydrate(row: {
  id: number;
  title: string;
  deadline: string | null;
  anchor_bill_id: string | null;
  anchor_event_id: string | null;
  anchor_election_date: string | null;
  steps_json: string;
  created_at: number;
}): ReminderRow {
  let steps: string[] = [];
  try {
    const parsed = JSON.parse(row.steps_json);
    if (Array.isArray(parsed)) steps = parsed.filter((s): s is string => typeof s === "string");
  } catch {
    steps = [];
  }
  return {
    id: row.id,
    title: row.title,
    deadline: row.deadline,
    anchorBillId: row.anchor_bill_id,
    anchorEventId: row.anchor_event_id,
    anchorElectionDate: row.anchor_election_date,
    steps,
    createdAt: row.created_at,
  };
}

type AnchorCheck = { ok: true; contextDate: string | null } | { ok: false; reason: string };

function verifyAnchor(db: PolitiClawDb, anchor: ReminderAnchor): AnchorCheck {
  if (anchor.kind === "bill") {
    const row = db.prepare(`SELECT id FROM bills WHERE id = ?`).get(anchor.billId) as
      | { id: string }
      | undefined;
    if (!row) return { ok: false, reason: `No stored bill with id '${anchor.billId}'.` };
    return { ok: true, contextDate: null };
  }
  if (anchor.kind === "event") {
    // Event rows aren't persisted as their own table — the event id is an
    // opaque reference carried on the reminder row for later display. We
    // accept the anchor at face value so the classifier-triggered flow
    // can fire immediately after a ChangedEvent surfaces.
    const trimmed = anchor.eventId.trim();
    if (!trimmed) return { ok: false, reason: "event anchor requires a non-empty eventId." };
    return { ok: true, contextDate: null };
  }
  // election
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor.electionDate)) {
    return { ok: false, reason: `election_date must be YYYY-MM-DD; got '${anchor.electionDate}'.` };
  }
  return { ok: true, contextDate: anchor.electionDate };
}

function buildSteps(input: CreateReminderInput, contextDate: string | null): string[] {
  const base: string[] = [];
  switch (input.anchor.kind) {
    case "event": {
      const when = contextDate ?? input.deadline;
      if (when) base.push(`Note committee meeting on ${when}.`);
      else base.push(`Note the scheduled committee event.`);
      const writtenBy = dateMinusDays(input.deadline ?? contextDate, 1);
      if (writtenBy) base.push(`If you plan to submit written input, draft it by ${writtenBy}.`);
      base.push("Confirm rep contact info via politiclaw_get_my_reps.");
      break;
    }
    case "election": {
      base.push("Verify polling location and ballot status.");
      const mailBy = dateMinusDays(input.anchor.electionDate, 3);
      if (mailBy) base.push(`If voting by mail, mail ballot by ${mailBy}.`);
      base.push("Run politiclaw_election_brief the week of.");
      break;
    }
    case "bill": {
      base.push(`Watch for scheduled action on bill ${input.anchor.billId}.`);
      base.push("Draft a letter or call script if alignment stays high.");
      break;
    }
  }
  if (input.extraSteps && input.extraSteps.length > 0) {
    for (const step of input.extraSteps) {
      const trimmed = step.trim();
      if (trimmed) base.push(trimmed);
    }
  }
  return base;
}

function dateMinusDays(iso: string | null | undefined, days: number): string | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms - days * MS_PER_DAY).toISOString().slice(0, 10);
}
