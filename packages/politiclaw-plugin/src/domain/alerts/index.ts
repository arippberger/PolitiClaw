import type { PolitiClawDb } from "../../storage/sqlite.js";

export type AlertKind = "bill_change" | "event_change";

export type AlertRow = {
  id: number;
  createdAt: number;
  kind: AlertKind;
  refId: string;
  changeReason: string;
  summary: string;
  sourceAdapterId: string;
  sourceTier: number;
};

export type AlertInput = {
  kind: AlertKind;
  refId: string;
  changeReason: string;
  summary: string;
  sourceAdapterId: string;
  sourceTier: number;
  createdAt?: number;
};

type RawRow = {
  id: number;
  created_at: number;
  kind: string;
  ref_id: string;
  change_reason: string;
  summary: string;
  source_adapter_id: string;
  source_tier: number;
};

function hydrate(row: RawRow): AlertRow {
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: row.kind as AlertKind,
    refId: row.ref_id,
    changeReason: row.change_reason,
    summary: row.summary,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}

/**
 * Append one alert row. Called by change-detection consumers that surfaced
 * a user-visible change. Never dedups — two separate sessions seeing the
 * same change *is* meaningful history (e.g. schema bump followed by a real
 * status transition on the same bill).
 */
export function recordAlert(db: PolitiClawDb, input: AlertInput): AlertRow {
  const createdAt = input.createdAt ?? Date.now();
  const result = db
    .prepare(
      `INSERT INTO alert_history
         (created_at, kind, ref_id, change_reason, summary, source_adapter_id, source_tier)
       VALUES (@created_at, @kind, @ref_id, @change_reason, @summary, @source_adapter_id, @source_tier)`,
    )
    .run({
      created_at: createdAt,
      kind: input.kind,
      ref_id: input.refId,
      change_reason: input.changeReason,
      summary: input.summary,
      source_adapter_id: input.sourceAdapterId,
      source_tier: input.sourceTier,
    });
  return {
    id: Number(result.lastInsertRowid),
    createdAt,
    kind: input.kind,
    refId: input.refId,
    changeReason: input.changeReason,
    summary: input.summary,
    sourceAdapterId: input.sourceAdapterId,
    sourceTier: input.sourceTier,
  };
}

export type ListAlertsOptions = {
  /** Max rows returned. Default 20. */
  limit?: number;
};

/**
 * Read the most recent alerts, newest first. The dashboard reads at most a
 * small window (default 20); callers that want paging can pass a larger
 * limit, but there is no offset path — the dashboard is a glance surface,
 * not a full log viewer.
 */
export function listRecentAlerts(
  db: PolitiClawDb,
  options: ListAlertsOptions = {},
): AlertRow[] {
  const limit = options.limit ?? 20;
  const rows = db
    .prepare(
      `SELECT id, created_at, kind, ref_id, change_reason, summary, source_adapter_id, source_tier
         FROM alert_history
        ORDER BY created_at DESC, id DESC
        LIMIT ?`,
    )
    .all(limit) as RawRow[];
  return rows.map(hydrate);
}
