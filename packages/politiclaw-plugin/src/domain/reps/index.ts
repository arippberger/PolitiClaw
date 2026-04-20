import type { PolitiClawDb } from "../../storage/sqlite.js";
import { getPreferences } from "../preferences/index.js";
import type { RepsResolver } from "../../sources/reps/index.js";
import type { Rep } from "../../sources/reps/types.js";

export type StoredRep = Rep & {
  lastSynced: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export type IdentifyResult =
  | { status: "ok"; reps: StoredRep[]; fromCache: boolean; source: { adapterId: string; tier: number } }
  | { status: "no_preferences"; reason: string; actionable: string }
  | { status: "unavailable"; reason: string; actionable?: string };

export type IdentifyOptions = {
  refresh?: boolean;
  /** Max age of cached reps before a refresh is forced. Default: 30 days. */
  maxAgeMs?: number;
};

const DEFAULT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export async function identifyMyReps(
  db: PolitiClawDb,
  resolver: RepsResolver,
  opts: IdentifyOptions = {},
): Promise<IdentifyResult> {
  const prefs = getPreferences(db);
  if (!prefs) {
    return {
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_set_preferences first",
    };
  }

  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
  const cached = listReps(db);
  const freshEnough =
    cached.length > 0 && cached.every((r) => Date.now() - r.lastSynced < maxAge);

  if (!opts.refresh && freshEnough) {
    const first = cached[0]!;
    return {
      status: "ok",
      reps: cached,
      fromCache: true,
      source: { adapterId: first.sourceAdapterId, tier: first.sourceTier },
    };
  }

  const result = await resolver.resolve({ address: prefs.address });
  if (result.status !== "ok") {
    return { status: "unavailable", reason: result.reason, actionable: result.actionable };
  }

  const stored = persistReps(db, result.data, result.adapterId, result.tier, result.fetchedAt);
  return {
    status: "ok",
    reps: stored,
    fromCache: false,
    source: { adapterId: result.adapterId, tier: result.tier },
  };
}

export function listReps(db: PolitiClawDb): StoredRep[] {
  const rows = db
    .prepare(
      `SELECT id, name, office, party, state, district, contact,
              last_synced, source_adapter_id, source_tier
       FROM reps ORDER BY office, state, district`,
    )
    .all() as Array<{
    id: string;
    name: string;
    office: string;
    party: string | null;
    state: string | null;
    district: string | null;
    contact: string | null;
    last_synced: number;
    source_adapter_id: string;
    source_tier: number;
  }>;

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    office: r.office as StoredRep["office"],
    party: r.party ?? undefined,
    state: r.state ?? undefined,
    district: r.district ?? undefined,
    contact: r.contact ? (JSON.parse(r.contact) as Record<string, unknown>) : undefined,
    lastSynced: r.last_synced,
    sourceAdapterId: r.source_adapter_id,
    sourceTier: r.source_tier,
  }));
}

function persistReps(
  db: PolitiClawDb,
  reps: Rep[],
  adapterId: string,
  tier: number,
  fetchedAt: number,
): StoredRep[] {
  const insert = db.prepare(
    `INSERT INTO reps (id, name, office, party, jurisdiction, district, state, contact,
                       last_synced, source_adapter_id, source_tier, raw)
     VALUES (@id, @name, @office, @party, @jurisdiction, @district, @state, @contact,
             @last_synced, @source_adapter_id, @source_tier, @raw)
     ON CONFLICT(id) DO UPDATE SET
       name              = excluded.name,
       office            = excluded.office,
       party             = excluded.party,
       jurisdiction      = excluded.jurisdiction,
       district          = excluded.district,
       state             = excluded.state,
       contact           = excluded.contact,
       last_synced       = excluded.last_synced,
       source_adapter_id = excluded.source_adapter_id,
       source_tier       = excluded.source_tier,
       raw               = excluded.raw`,
  );

  const knownIds = new Set<string>();
  db.transaction(() => {
    for (const rep of reps) {
      knownIds.add(rep.id);
      insert.run({
        id: rep.id,
        name: rep.name,
        office: rep.office,
        party: rep.party ?? null,
        jurisdiction: jurisdictionOf(rep),
        district: rep.district ?? null,
        state: rep.state ?? null,
        contact: rep.contact ? JSON.stringify(rep.contact) : null,
        last_synced: fetchedAt,
        source_adapter_id: adapterId,
        source_tier: tier,
        raw: JSON.stringify(rep),
      });
    }
    // The resolver picks a single authoritative adapter per call, so the
    // returned set owns the table. Prune any leftover rows — including those
    // written by a previously-winning adapter — so callers never see mixed
    // provenance when we return `listReps(db)` below.
    if (knownIds.size > 0) {
      const placeholders = Array.from(knownIds, () => "?").join(",");
      db.prepare(`DELETE FROM reps WHERE id NOT IN (${placeholders})`).run(
        ...Array.from(knownIds),
      );
    } else {
      db.prepare(`DELETE FROM reps`).run();
    }
  })();

  return listReps(db);
}

function jurisdictionOf(rep: Rep): string | null {
  if (!rep.state) return null;
  if (rep.office === "US House" && rep.district) return `US-${rep.state}-${rep.district}`;
  return `US-${rep.state}`;
}
