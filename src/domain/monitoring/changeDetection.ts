import { createHash } from "node:crypto";
import type { PolitiClawDb } from "../../storage/sqlite.js";

/**
 * The set of entity kinds we track for change detection. Every kind must
 * document (and, ideally, centralize) the exact field set it hashes under
 * {@link HashInputVersion}. Adding a kind without bumping the version for
 * its future variants is a bug — the migration comment on `snapshots`
 * explains why.
 */
export type SnapshotKind = "bill" | "committee_meeting";

/**
 * Per-kind hash schema version. Bumping this number invalidates every
 * stored row of that kind: on next check they all compare as "new". This
 * is intentional — the alternative is silently treating a schema change
 * as "unchanged" and missing real drifts. Keep this as a typed record so
 * the compiler catches missing kinds.
 */
export const HashInputVersion: Record<SnapshotKind, number> = {
  bill: 1,
  committee_meeting: 1,
};

export type ChangeDetectionInput = {
  kind: SnapshotKind;
  id: string;
  /**
   * Deterministic JSON payload of API-only fields to hash. Must NOT contain
   * LLM-derived strings, scrape timestamps, or user-specific data
   * because snapshot inputs must come from deterministic sources only. The
   * function sorts object keys before hashing so the caller does not need to.
   */
  hashInput: unknown;
  source: { adapterId: string; tier: number };
};

export type ChangeReason = "new" | "unchanged" | "changed" | "schema_bump";

export type ChangeDetectionResult = {
  changed: boolean;
  reason: ChangeReason;
  currentHash: string;
  previousHash: string | null;
  lastChangedAt: number;
  firstSeenAt: number;
};

/**
 * Core change-detection primitive. Compares the hash of `hashInput` against
 * the last stored snapshot for this entity and updates the row atomically.
 *
 * Contract:
 *  - First call for an (entity_kind, entity_id) pair → `reason: "new"`,
 *    `changed: true`.
 *  - Same payload again → `reason: "unchanged"`, `changed: false`. The row's
 *    `last_seen_at` still moves forward (cheap heartbeat).
 *  - Different payload → `reason: "changed"`, `changed: true`, both
 *    `last_seen_at` and `last_changed_at` move.
 *  - `hash_input_version` on disk differs from {@link HashInputVersion}
 *    for this kind → `reason: "schema_bump"`, `changed: true`. The row is
 *    rewritten with the new version.
 *
 * This is the only place that computes snapshot hashes. Callers must not
 * compare hashes themselves — that would bypass the tier-provenance and
 * version-bump invariants.
 */
export function detectChange(
  db: PolitiClawDb,
  input: ChangeDetectionInput,
): ChangeDetectionResult {
  const now = Date.now();
  const version = HashInputVersion[input.kind];
  const currentHash = hashPayload(input.hashInput);

  const existing = db
    .prepare(
      `SELECT hash_input_version, content_hash, first_seen_at, last_changed_at
         FROM snapshots
         WHERE entity_kind = @kind AND entity_id = @id`,
    )
    .get({ kind: input.kind, id: input.id }) as
    | {
        hash_input_version: number;
        content_hash: string;
        first_seen_at: number;
        last_changed_at: number;
      }
    | undefined;

  if (!existing) {
    insertRow(db, input, currentHash, version, now);
    return {
      changed: true,
      reason: "new",
      currentHash,
      previousHash: null,
      lastChangedAt: now,
      firstSeenAt: now,
    };
  }

  if (existing.hash_input_version !== version) {
    updateRow(db, input, currentHash, version, now, /* touchChanged */ true);
    return {
      changed: true,
      reason: "schema_bump",
      currentHash,
      previousHash: existing.content_hash,
      lastChangedAt: now,
      firstSeenAt: existing.first_seen_at,
    };
  }

  if (existing.content_hash === currentHash) {
    db.prepare(
      `UPDATE snapshots SET last_seen_at = @now
         WHERE entity_kind = @kind AND entity_id = @id`,
    ).run({ now, kind: input.kind, id: input.id });
    return {
      changed: false,
      reason: "unchanged",
      currentHash,
      previousHash: existing.content_hash,
      lastChangedAt: existing.last_changed_at,
      firstSeenAt: existing.first_seen_at,
    };
  }

  updateRow(db, input, currentHash, version, now, /* touchChanged */ true);
  return {
    changed: true,
    reason: "changed",
    currentHash,
    previousHash: existing.content_hash,
    lastChangedAt: now,
    firstSeenAt: existing.first_seen_at,
  };
}

/**
 * Read the last-recorded snapshot for an entity without touching it.
 * Useful for tool output that wants to report "first seen X days ago."
 */
export type StoredSnapshot = {
  kind: SnapshotKind;
  id: string;
  hashInputVersion: number;
  contentHash: string;
  firstSeenAt: number;
  lastSeenAt: number;
  lastChangedAt: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export function readSnapshot(
  db: PolitiClawDb,
  kind: SnapshotKind,
  id: string,
): StoredSnapshot | null {
  const row = db
    .prepare(
      `SELECT entity_kind, entity_id, hash_input_version, content_hash,
              first_seen_at, last_seen_at, last_changed_at,
              source_adapter_id, source_tier
         FROM snapshots
         WHERE entity_kind = @kind AND entity_id = @id`,
    )
    .get({ kind, id }) as
    | {
        entity_kind: SnapshotKind;
        entity_id: string;
        hash_input_version: number;
        content_hash: string;
        first_seen_at: number;
        last_seen_at: number;
        last_changed_at: number;
        source_adapter_id: string;
        source_tier: number;
      }
    | undefined;
  if (!row) return null;
  return {
    kind: row.entity_kind,
    id: row.entity_id,
    hashInputVersion: row.hash_input_version,
    contentHash: row.content_hash,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    lastChangedAt: row.last_changed_at,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}

function insertRow(
  db: PolitiClawDb,
  input: ChangeDetectionInput,
  hash: string,
  version: number,
  now: number,
): void {
  db.prepare(
    `INSERT INTO snapshots (entity_kind, entity_id, hash_input_version, content_hash,
                            first_seen_at, last_seen_at, last_changed_at,
                            source_adapter_id, source_tier)
     VALUES (@kind, @id, @version, @hash, @now, @now, @now, @adapter, @tier)`,
  ).run({
    kind: input.kind,
    id: input.id,
    version,
    hash,
    now,
    adapter: input.source.adapterId,
    tier: input.source.tier,
  });
}

function updateRow(
  db: PolitiClawDb,
  input: ChangeDetectionInput,
  hash: string,
  version: number,
  now: number,
  touchChanged: boolean,
): void {
  const setChanged = touchChanged ? ", last_changed_at = @now" : "";
  db.prepare(
    `UPDATE snapshots SET
       hash_input_version = @version,
       content_hash       = @hash,
       last_seen_at       = @now${setChanged},
       source_adapter_id  = @adapter,
       source_tier        = @tier
     WHERE entity_kind = @kind AND entity_id = @id`,
  ).run({
    kind: input.kind,
    id: input.id,
    version,
    hash,
    now,
    adapter: input.source.adapterId,
    tier: input.source.tier,
  });
}

/**
 * Canonical JSON for hashing: recursively sorts object keys so that the
 * same logical payload always produces the same hash regardless of the
 * order fields came off the network. Arrays keep their order (ordering is
 * meaningful for sponsor lists, action history, etc).
 */
export function canonicalize(value: unknown): string {
  return JSON.stringify(normalize(value));
}

function normalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    const out: Record<string, unknown> = {};
    for (const [k, v] of entries) out[k] = normalize(v);
    return out;
  }
  return value;
}

function hashPayload(payload: unknown): string {
  return createHash("sha256").update(canonicalize(payload)).digest("hex");
}
