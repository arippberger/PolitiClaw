import type { PolitiClawDb } from "../../storage/sqlite.js";
import { parse } from "../../validation/typebox.js";
import {
  ACTION_PROMPTING_VALUES,
  AccountabilityModeSchema,
  ActionPromptingSchema,
  IssueStanceSchema,
  MONITORING_MODE_VALUES,
  MonitoringModeSchema,
  PreferencesSchema,
  StanceSignalSchema,
  type AccountabilityMode,
  type ActionPrompting,
  type IssueStance,
  type IssueStanceInput,
  type IssueStanceRow,
  type MonitoringMode,
  type Preferences,
  type PreferencesRow,
  type StanceSignal,
} from "./types.js";
import { DEFAULT_ACCOUNTABILITY } from "./accountability.js";

const DEFAULT_STANCE_SIGNAL_WEIGHT = 1.0;
const DEFAULT_ISSUE_STANCE_WEIGHT = 3;

function normalizePreferencesInput(input: Preferences): Preferences {
  return {
    ...input,
    zip: input.zip?.trim(),
    state: input.state?.trim().toUpperCase(),
    district: input.district?.trim(),
  };
}

function normalizeIssueKey(issue: string): string {
  return issue.trim().toLowerCase().replace(/\s+/g, "-");
}

export {
  ACTION_PROMPTING_VALUES,
  AccountabilityModeSchema,
  ActionPromptingSchema,
  IssueStanceSchema,
  MONITORING_MODE_VALUES,
  MonitoringModeSchema,
  PreferencesSchema,
  StanceSignalSchema,
};
export type {
  AccountabilityMode,
  ActionPrompting,
  IssueStance,
  IssueStanceInput,
  IssueStanceRow,
  MonitoringMode,
  Preferences,
  PreferencesRow,
  StanceSignal,
};
export {
  ACCOUNTABILITY_VALUES,
  ACCOUNTABILITY_EXPLAINERS,
  ACCOUNTABILITY_LABELS,
  ACCOUNTABILITY_KV_FLAG,
  DEFAULT_ACCOUNTABILITY,
} from "./accountability.js";

type PrefsColumnsRow = {
  address: string;
  zip: string | null;
  state: string | null;
  district: string | null;
  monitoring_mode: MonitoringMode;
  accountability: AccountabilityMode | null;
  action_prompting: ActionPrompting;
  updated_at: number;
};

export function getPreferences(db: PolitiClawDb): PreferencesRow | null {
  const row = db
    .prepare(
      "SELECT address, zip, state, district, monitoring_mode, accountability, action_prompting, updated_at FROM preferences WHERE id = 1",
    )
    .get() as PrefsColumnsRow | undefined;
  if (!row) return null;
  return {
    address: row.address,
    zip: row.zip ?? undefined,
    state: row.state ?? undefined,
    district: row.district ?? undefined,
    monitoringMode: row.monitoring_mode,
    accountability: row.accountability ?? DEFAULT_ACCOUNTABILITY,
    actionPrompting: row.action_prompting,
    updatedAt: row.updated_at,
  };
}

export function upsertPreferences(db: PolitiClawDb, input: Preferences): PreferencesRow {
  const parsed = parse(PreferencesSchema, normalizePreferencesInput(input));
  const existing = db
    .prepare(
      "SELECT monitoring_mode, accountability, action_prompting FROM preferences WHERE id = 1",
    )
    .get() as
    | {
        monitoring_mode: MonitoringMode;
        accountability: AccountabilityMode | null;
        action_prompting: ActionPrompting;
      }
    | undefined;
  const mode = parsed.monitoringMode ?? existing?.monitoring_mode ?? "action_only";
  const accountability =
    parsed.accountability ?? existing?.accountability ?? DEFAULT_ACCOUNTABILITY;
  const actionPrompting =
    parsed.actionPrompting ?? existing?.action_prompting ?? "on";
  const now = Date.now();
  db.prepare(
    `INSERT INTO preferences (id, address, zip, state, district, monitoring_mode, accountability, action_prompting, updated_at)
     VALUES (1, @address, @zip, @state, @district, @monitoring_mode, @accountability, @action_prompting, @updated_at)
     ON CONFLICT(id) DO UPDATE SET
       address          = excluded.address,
       zip              = excluded.zip,
       state            = excluded.state,
       district         = excluded.district,
       monitoring_mode  = excluded.monitoring_mode,
       accountability   = excluded.accountability,
       action_prompting = excluded.action_prompting,
       updated_at       = excluded.updated_at`,
  ).run({
    address: parsed.address,
    zip: parsed.zip ?? null,
    state: parsed.state ?? null,
    district: parsed.district ?? null,
    monitoring_mode: mode,
    accountability,
    action_prompting: actionPrompting,
    updated_at: now,
  });
  return {
    ...parsed,
    monitoringMode: mode,
    accountability,
    actionPrompting,
    updatedAt: now,
  };
}

function requirePrefsRow(db: PolitiClawDb, label: string): PrefsColumnsRow {
  const existing = db
    .prepare(
      "SELECT address, zip, state, district, monitoring_mode, accountability, action_prompting, updated_at FROM preferences WHERE id = 1",
    )
    .get() as PrefsColumnsRow | undefined;
  if (!existing) {
    throw new Error(
      `Cannot set ${label} before address is saved. Call politiclaw_configure first.`,
    );
  }
  return existing;
}

function rowFromColumns(row: PrefsColumnsRow, overrides: Partial<PreferencesRow>): PreferencesRow {
  const base: PreferencesRow = {
    address: row.address,
    zip: row.zip ?? undefined,
    state: row.state ?? undefined,
    district: row.district ?? undefined,
    monitoringMode: row.monitoring_mode,
    accountability: row.accountability ?? DEFAULT_ACCOUNTABILITY,
    actionPrompting: row.action_prompting,
    updatedAt: row.updated_at,
  };
  return { ...base, ...overrides };
}

export function setMonitoringMode(
  db: PolitiClawDb,
  mode: MonitoringMode,
): PreferencesRow {
  const parsed = parse(MonitoringModeSchema, mode);
  const existing = requirePrefsRow(db, "monitoring mode");
  const now = Date.now();
  db.prepare(
    `UPDATE preferences
       SET monitoring_mode = @mode,
           updated_at = @updated_at
     WHERE id = 1`,
  ).run({ mode: parsed, updated_at: now });
  return rowFromColumns(existing, { monitoringMode: parsed, updatedAt: now });
}

export function setAccountability(
  db: PolitiClawDb,
  mode: AccountabilityMode,
): PreferencesRow {
  const parsed = parse(AccountabilityModeSchema, mode);
  const existing = requirePrefsRow(db, "accountability");
  const now = Date.now();
  db.prepare(
    `UPDATE preferences
       SET accountability = @accountability,
           updated_at = @updated_at
     WHERE id = 1`,
  ).run({ accountability: parsed, updated_at: now });
  return rowFromColumns(existing, { accountability: parsed, updatedAt: now });
}

export function setActionPrompting(
  db: PolitiClawDb,
  value: ActionPrompting,
): PreferencesRow {
  const parsed = parse(ActionPromptingSchema, value);
  const existing = requirePrefsRow(db, "action prompting");
  const now = Date.now();
  db.prepare(
    `UPDATE preferences
       SET action_prompting = @value,
           updated_at = @updated_at
     WHERE id = 1`,
  ).run({ value: parsed, updated_at: now });
  return rowFromColumns(existing, { actionPrompting: parsed, updatedAt: now });
}

export function recordStanceSignal(db: PolitiClawDb, input: StanceSignal): number {
  const normalized: StanceSignal = {
    ...input,
    issue: input.issue?.trim(),
    billId: input.billId?.trim(),
  };
  const parsed = parse(StanceSignalSchema, normalized);
  if (parsed.issue === undefined && parsed.billId === undefined) {
    throw new Error("one of issue or billId is required");
  }
  const weight = parsed.weight ?? DEFAULT_STANCE_SIGNAL_WEIGHT;
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
      weight,
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

export function upsertIssueStance(db: PolitiClawDb, input: IssueStanceInput): IssueStanceRow {
  const normalized: IssueStanceInput = {
    ...input,
    issue: normalizeIssueKey(input.issue),
  };
  const parsed = parse(IssueStanceSchema, normalized);
  const weight = parsed.weight ?? DEFAULT_ISSUE_STANCE_WEIGHT;
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
    weight,
    updated_at: now,
  });
  return { ...parsed, weight, updatedAt: now };
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
  const result = db
    .prepare(`DELETE FROM issue_stances WHERE issue = ?`)
    .run(normalizeIssueKey(issue));
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
