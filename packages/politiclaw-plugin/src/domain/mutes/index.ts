import type { PolitiClawDb } from "../../storage/sqlite.js";
import { parse } from "../../validation/typebox.js";
import {
  MUTE_KINDS,
  MuteInputSchema,
  MuteKindSchema,
  UnmuteInputSchema,
  type MuteInput,
  type MuteKind,
  type MuteRow,
  type UnmuteInput,
} from "./types.js";

export { MUTE_KINDS, MuteInputSchema, MuteKindSchema, UnmuteInputSchema };
export type { MuteInput, MuteKind, MuteRow, UnmuteInput };

type RawMuteRow = {
  kind: string;
  ref: string;
  reason: string | null;
  muted_at: number;
};

function hydrate(row: RawMuteRow): MuteRow {
  return {
    kind: row.kind as MuteKind,
    ref: row.ref,
    reason: row.reason,
    mutedAt: row.muted_at,
  };
}

/**
 * Insert or update a mute. Idempotent on `(kind, ref)` — re-muting the same
 * target refreshes the reason and `muted_at` timestamp rather than erroring.
 */
export function addMute(db: PolitiClawDb, input: MuteInput): MuteRow {
  const normalized: MuteInput = {
    ...input,
    ref: input.ref.trim(),
    reason: input.reason?.trim() || undefined,
  };
  const parsed = parse(MuteInputSchema, normalized);
  const normalizedRef = normalizeRef(parsed.kind, parsed.ref);
  const now = Date.now();
  db.prepare(
    `INSERT INTO mute_list (kind, ref, reason, muted_at)
     VALUES (@kind, @ref, @reason, @muted_at)
     ON CONFLICT(kind, ref) DO UPDATE SET
       reason   = excluded.reason,
       muted_at = excluded.muted_at`,
  ).run({
    kind: parsed.kind,
    ref: normalizedRef,
    reason: parsed.reason ?? null,
    muted_at: now,
  });
  return {
    kind: parsed.kind,
    ref: normalizedRef,
    reason: parsed.reason ?? null,
    mutedAt: now,
  };
}

export function removeMute(
  db: PolitiClawDb,
  input: { kind: MuteKind; ref: string },
): boolean {
  const kind = parse(MuteKindSchema, input.kind);
  const ref = normalizeRef(kind, input.ref);
  const result = db
    .prepare(`DELETE FROM mute_list WHERE kind = ? AND ref = ?`)
    .run(kind, ref);
  return result.changes > 0;
}

export function listMutes(db: PolitiClawDb): MuteRow[] {
  const rows = db
    .prepare(
      `SELECT kind, ref, reason, muted_at
         FROM mute_list
        ORDER BY muted_at DESC, kind ASC, ref ASC`,
    )
    .all() as RawMuteRow[];
  return rows.map(hydrate);
}

/**
 * Return the set of refs muted for a given kind. Useful for cheap
 * "is this one muted?" filtering at the call site; a Set lookup beats
 * round-tripping to SQLite for every candidate row.
 */
export function listMutedRefs(db: PolitiClawDb, kind: MuteKind): Set<string> {
  const parsed = parse(MuteKindSchema, kind);
  const rows = db
    .prepare(`SELECT ref FROM mute_list WHERE kind = ?`)
    .all(parsed) as Array<{ ref: string }>;
  return new Set(rows.map((row) => row.ref));
}

export function isMuted(
  db: PolitiClawDb,
  input: { kind: MuteKind; ref: string },
): boolean {
  const kind = parse(MuteKindSchema, input.kind);
  const ref = normalizeRef(kind, input.ref);
  const row = db
    .prepare(`SELECT 1 FROM mute_list WHERE kind = ? AND ref = ? LIMIT 1`)
    .get(kind, ref) as { "1": number } | undefined;
  return row !== undefined;
}

/**
 * Normalize the `ref` based on the kind so that user-entered labels and
 * canonical ids compare equal. Bill ids and rep bioguide ids are already
 * canonical in the rest of the DB — we just trim them. Issue refs mirror the
 * `issue_stances.issue` normalization (lowercase kebab-case).
 */
function normalizeRef(kind: MuteKind, ref: string): string {
  const trimmed = ref.trim();
  if (kind === "issue") {
    return trimmed.toLowerCase().replace(/\s+/g, "-");
  }
  return trimmed;
}
