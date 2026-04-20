import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import {
  createCongressGovHouseVotesAdapter,
  type HouseVotesAdapter,
} from "./congressGov.js";
import type {
  RollCallVote,
  RollCallVoteListFilters,
  RollCallVoteRef,
  RollCallVoteWithMembers,
} from "./types.js";

export type HouseVotesResolverOptions = {
  apiDataGovKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
};

/**
 * Resolver for House roll-call votes. Mirrors `createBillsResolver`:
 * api.congress.gov (tier 1) is the only primary-source adapter; without the
 * `apiDataGov` key we return a structured "unavailable". There is no
 * LLM-search fallback — a missing primary surfaces as "insufficient data" to
 * the scoring layer, never as paraphrased vote positions.
 *
 * A `unitedstates/congress` scraper adapter will be able to slot in here as
 * a zero-key fallback for both chambers; Senate support depends on that work
 * landing.
 */
export function createHouseVotesResolver(opts: HouseVotesResolverOptions = {}) {
  const adapters: HouseVotesAdapter[] = [];
  if (opts.apiDataGovKey) {
    adapters.push(
      createCongressGovHouseVotesAdapter({
        apiKey: opts.apiDataGovKey,
        fetcher: opts.fetcher,
        now: opts.now,
        baseUrl: opts.baseUrl,
      }),
    );
  }

  return {
    async list(
      filters: RollCallVoteListFilters,
    ): Promise<AdapterResult<RollCallVote[]>> {
      if (adapters.length === 0) return zeroKeyUnavailable();
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.list(filters);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "houseVotes",
        `no house-votes source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.apiDataGov",
      );
    },
    async getWithMembers(
      ref: RollCallVoteRef,
    ): Promise<AdapterResult<RollCallVoteWithMembers>> {
      if (adapters.length === 0) return zeroKeyUnavailable();
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.getWithMembers(ref);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "houseVotes",
        `no house-votes source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.apiDataGov",
      );
    },
    adapterIds(): string[] {
      return adapters.map((adapter) => adapter.id);
    },
  };
}

export type HouseVotesResolver = ReturnType<typeof createHouseVotesResolver>;

function zeroKeyUnavailable<T>(): AdapterResult<T> {
  return unavailable(
    "houseVotes",
    "no house-votes source configured",
    "set plugins.politiclaw.apiKeys.apiDataGov (free, https://api.data.gov/signup/)",
  );
}
