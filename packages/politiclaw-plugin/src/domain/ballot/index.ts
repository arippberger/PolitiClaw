import { createHash } from "node:crypto";

import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BallotResolver } from "../../sources/ballot/index.js";
import type {
  NormalizedBallotContest,
  NormalizedBallotSnapshot,
} from "../../sources/ballot/types.js";
import type { PreferencesRow } from "../preferences/types.js";
import { getPreferences } from "../preferences/index.js";

const DEFAULT_TTL_MS = 86_400_000;

export type GetBallotSnapshotResult =
  | {
      status: "no_preferences";
      reason: string;
      actionable: string;
    }
  | {
      status: "unavailable";
      reason: string;
      actionable?: string;
      adapterId?: string;
    }
  | {
      status: "ok";
      addressLine: string;
      ballot: NormalizedBallotSnapshot;
      fromCache: boolean;
      source: { adapterId: string; tier: number };
      addressHash: string;
    };

export function formatBallotAddress(preferences: PreferencesRow): string {
  const chunks: string[] = [preferences.address.trim()];
  if (preferences.zip?.trim()) {
    chunks.push(preferences.zip.trim());
  }
  if (preferences.state?.trim()) {
    chunks.push(preferences.state.trim());
  }
  return chunks.join(", ");
}

export function ballotAddressHash(formattedAddress: string): string {
  return createHash("sha256").update(formattedAddress.trim().toLowerCase()).digest("hex").slice(0, 32);
}

export type GetBallotSnapshotOptions = {
  refresh?: boolean;
  ttlMs?: number;
};

export async function getBallotSnapshot(
  database: PolitiClawDb,
  resolver: BallotResolver,
  options: GetBallotSnapshotOptions = {},
): Promise<GetBallotSnapshotResult> {
  const ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;

  const preferencesRow = getPreferences(database);

  if (!preferencesRow) {
    return {
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    };
  }

  const addressLine = formatBallotAddress(preferencesRow);
  const addressHash = ballotAddressHash(addressLine);

  if (!options.refresh) {
    const cached = database
      .prepare(
        `SELECT fetched_at, ttl_ms, contests_json, logistics_json, election_json,
                normalized_input_json, source_adapter_id, source_tier
           FROM ballots
          WHERE address_hash = @hash`,
      )
      .get({ hash: addressHash }) as
      | {
          fetched_at: number;
          ttl_ms: number;
          contests_json: string;
          logistics_json: string;
          election_json: string | null;
          normalized_input_json: string | null;
          source_adapter_id: string;
          source_tier: number;
        }
      | undefined;

    if (cached && Date.now() - cached.fetched_at < cached.ttl_ms) {
      const contests = JSON.parse(cached.contests_json) as NormalizedBallotContest[];
      const logisticsRecord = JSON.parse(cached.logistics_json) as {
        pollingLocationCount: number;
        primaryPolling?: NormalizedBallotSnapshot["primaryPolling"];
        registrationUrl?: string | null;
        electionAdministrationUrl?: string | null;
      };
      const ballot: NormalizedBallotSnapshot = {
        normalizedInput: cached.normalized_input_json
          ? (JSON.parse(cached.normalized_input_json) as NormalizedBallotSnapshot["normalizedInput"])
          : undefined,
        election: cached.election_json
          ? (JSON.parse(cached.election_json) as NormalizedBallotSnapshot["election"])
          : undefined,
        contests,
        primaryPolling: logisticsRecord.primaryPolling ?? null,
        pollingLocationCount: logisticsRecord.pollingLocationCount,
        registrationUrl: logisticsRecord.registrationUrl ?? null,
        electionAdministrationUrl: logisticsRecord.electionAdministrationUrl ?? null,
      };

      return {
        status: "ok",
        addressLine,
        ballot,
        fromCache: true,
        source: { adapterId: cached.source_adapter_id, tier: cached.source_tier },
        addressHash,
      };
    }
  }

  const remote = await resolver.voterInfo(addressLine);
  if (remote.status !== "ok") {
    return {
      status: "unavailable",
      reason: remote.reason,
      actionable: remote.actionable,
      adapterId: remote.adapterId,
    };
  }

  persistBallotSnapshot(database, addressHash, remote.data, remote.adapterId, remote.tier, ttlMs, remote.fetchedAt);

  return {
    status: "ok",
    addressLine,
    ballot: remote.data,
    fromCache: false,
    source: { adapterId: remote.adapterId, tier: remote.tier },
    addressHash,
  };
}

function persistBallotSnapshot(
  database: PolitiClawDb,
  addressHash: string,
  snapshot: NormalizedBallotSnapshot,
  sourceAdapterId: string,
  sourceTier: number,
  ttlMs: number,
  fetchedAt: number,
): void {
  const logisticsRecord = {
    pollingLocationCount: snapshot.pollingLocationCount,
    primaryPolling: snapshot.primaryPolling,
    registrationUrl: snapshot.registrationUrl,
    electionAdministrationUrl: snapshot.electionAdministrationUrl,
  };

  database
    .prepare(
      `INSERT INTO ballots
         (address_hash, normalized_input_json, election_json, contests_json,
          logistics_json, fetched_at, ttl_ms, source_adapter_id, source_tier,
          raw_response_json)
       VALUES
         (@hash, @normalized_input, @election, @contests, @logistics,
          @fetched_at, @ttl_ms, @adapter_id, @tier, @raw)
       ON CONFLICT(address_hash) DO UPDATE SET
         normalized_input_json = excluded.normalized_input_json,
         election_json         = excluded.election_json,
         contests_json         = excluded.contests_json,
         logistics_json        = excluded.logistics_json,
         fetched_at            = excluded.fetched_at,
         ttl_ms                = excluded.ttl_ms,
         source_adapter_id     = excluded.source_adapter_id,
         source_tier           = excluded.source_tier,
         raw_response_json     = excluded.raw_response_json`,
    )
    .run({
      hash: addressHash,
      normalized_input: snapshot.normalizedInput ? JSON.stringify(snapshot.normalizedInput) : null,
      election: snapshot.election ? JSON.stringify(snapshot.election) : null,
      contests: JSON.stringify(snapshot.contests),
      logistics: JSON.stringify(logisticsRecord),
      fetched_at: fetchedAt,
      ttl_ms: ttlMs,
      adapter_id: sourceAdapterId,
      tier: sourceTier,
      raw: JSON.stringify(snapshot),
    });
}
