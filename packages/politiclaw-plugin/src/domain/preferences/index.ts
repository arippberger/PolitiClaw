import type { PolitiClawDb } from "../../storage/sqlite.js";
import {
  IssueStanceSchema,
  MonitoringCadenceSchema,
  PreferencesSchema,
  StanceSignalSchema,
  type IssueStance,
  type IssueStanceRow,
  type MonitoringCadence,
  type Preferences,
  type PreferencesRow,
  type StanceSignal,
} from "./types.js";

export {
  IssueStanceSchema,
  MonitoringCadenceSchema,
  PreferencesSchema,
  StanceSignalSchema,
};
export type {
  IssueStance,
  IssueStanceRow,
  MonitoringCadence,
  Preferences,
  PreferencesRow,
  StanceSignal,
};

export function getPreferences(db: PolitiClawDb): PreferencesRow | null {
  const row = db
    .prepare(
      "SELECT address, zip, state, district, monitoring_cadence, updated_at FROM preferences WHERE id = 1",
    )
    .get() as
    | {
        address: string;
        zip: string | null;
        state: string | null;
        district: string | null;
        monitoring_cadence: MonitoringCadence;
        updated_at: number;
      }
    | undefined;
  if (!row) return null;
  return {
    address: row.address,
    zip: row.zip ?? undefined,
    state: row.state ?? undefined,
    district: row.district ?? undefined,
    monitoringCadence: row.monitoring_cadence,
    updatedAt: row.updated_at,
  };
}

export function upsertPreferences(db: PolitiClawDb, input: Preferences): PreferencesRow {
  const parsed = PreferencesSchema.parse(input);
  const existing = db
    .prepare("SELECT monitoring_cadence FROM preferences WHERE id = 1")
    .get() as { monitoring_cadence: MonitoringCadence } | undefined;
  const cadence =
    parsed.monitoringCadence ?? existing?.monitoring_cadence ?? "election_proximity";
  const now = Date.now();
  db.prepare(
    `INSERT INTO preferences (id, address, zip, state, district, monitoring_cadence, updated_at)
     VALUES (1, @address, @zip, @state, @district, @monitoring_cadence, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       address            = excluded.address,
       zip                = excluded.zip,
       state              = excluded.state,
       district           = excluded.district,
       monitoring_cadence = excluded.monitoring_cadence,
       updated_at         = excluded.updated_at`,
  ).run({
    address: parsed.address,
    zip: parsed.zip ?? null,
    state: parsed.state ?? null,
    district: parsed.district ?? null,
    monitoring_cadence: cadence,
    updated_at: now,
  });
  return { ...parsed, monitoringCadence: cadence, updatedAt: now };
}

export function setMonitoringCadence(
  db: PolitiClawDb,
  cadence: MonitoringCadence,
): PreferencesRow {
  const parsed = MonitoringCadenceSchema.parse(cadence);
  const existing = db
    .prepare(
      "SELECT address, zip, state, district FROM preferences WHERE id = 1",
    )
    .get() as
    | {
        address: string;
        zip: string | null;
        state: string | null;
        district: string | null;
      }
    | undefined;
  if (!existing) {
    throw new Error(
      "Cannot set monitoring cadence before address is saved. Call politiclaw_configure first.",
    );
  }
  const now = Date.now();
  db.prepare(
    `UPDATE preferences
       SET monitoring_cadence = @cadence,
           updated_at = @updated_at
     WHERE id = 1`,
  ).run({ cadence: parsed, updated_at: now });
  return {
    address: existing.address,
    zip: existing.zip ?? undefined,
    state: existing.state ?? undefined,
    district: existing.district ?? undefined,
    monitoringCadence: parsed,
    updatedAt: now,
  };
}

export function recordStanceSignal(db: PolitiClawDb, input: StanceSignal): number {
  const parsed = StanceSignalSchema.parse(input);
  const now = Date.now();
  const res = db
    .prepare(
      `INSERT INTO stance_signals (issue, bill_id, direction, weight, source, created_at)
       VALUES (@issue, @bill_id, @direction, @weight, @source, @created_at)`,
    )
    .run({
      issue: parsed.issue ?? null,
      bill_id: parsed.billId ?? null,
      direction: parsed.direction,
      weight: parsed.weight,
      source: parsed.source,
      created_at: now,
    });
  return Number(res.lastInsertRowid);
}

export type StanceSignalRow = {
  id: number;
  issue: string | null;
  billId: string | null;
  direction: "agree" | "disagree" | "skip";
  weight: number;
  source: string;
  createdAt: number;
};

export function upsertIssueStance(db: PolitiClawDb, input: IssueStance): IssueStanceRow {
  const parsed = IssueStanceSchema.parse(input);
  const now = Date.now();
  db.prepare(
    `INSERT INTO issue_stances (issue, stance, weight, updated_at)
     VALUES (@issue, @stance, @weight, @updated_at)
     ON CONFLICT(issue) DO UPDATE SET
       stance     = excluded.stance,
       weight     = excluded.weight,
       updated_at = excluded.updated_at`,
  ).run({
    issue: parsed.issue,
    stance: parsed.stance,
    weight: parsed.weight,
    updated_at: now,
  });
  return { ...parsed, updatedAt: now };
}

export function listIssueStances(db: PolitiClawDb): IssueStanceRow[] {
  const rows = db
    .prepare(
      `SELECT issue, stance, weight, updated_at FROM issue_stances ORDER BY weight DESC, issue ASC`,
    )
    .all() as Array<{ issue: string; stance: string; weight: number; updated_at: number }>;
  return rows.map((row) => ({
    issue: row.issue,
    stance: row.stance as IssueStance["stance"],
    weight: row.weight,
    updatedAt: row.updated_at,
  }));
}

export function deleteIssueStance(db: PolitiClawDb, issue: string): boolean {
  const normalized = issue.trim().toLowerCase().replace(/\s+/g, "-");
  const result = db.prepare(`DELETE FROM issue_stances WHERE issue = ?`).run(normalized);
  return result.changes > 0;
}

export function listStanceSignals(db: PolitiClawDb, limit = 100): StanceSignalRow[] {
  const rows = db
    .prepare(
      `SELECT id, issue, bill_id, direction, weight, source, created_at
       FROM stance_signals ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    issue: string | null;
    bill_id: string | null;
    direction: "agree" | "disagree" | "skip";
    weight: number;
    source: string;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    issue: r.issue,
    billId: r.bill_id,
    direction: r.direction,
    weight: r.weight,
    source: r.source,
    createdAt: r.created_at,
  }));
}
