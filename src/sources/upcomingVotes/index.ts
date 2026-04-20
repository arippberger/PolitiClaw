import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import {
  createCongressGovUpcomingAdapter,
  type UpcomingVotesAdapter,
} from "./congressGov.js";
import type { UpcomingEvent, UpcomingEventsFilters } from "./types.js";

export type UpcomingVotesResolverOptions = {
  apiDataGovKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
};

/**
 * Resolver for upcoming federal vote-adjacent events (committee meetings,
 * markups, hearings). Mirrors `createBillsResolver` — api.congress.gov is
 * the primary tier-1 adapter; without the `apiDataGov` key we return a
 * structured "unavailable" rather than falling back to LLM search. Snapshot
 * inputs must come from deterministic sources only, so LLM search is not a
 * valid fallback here.
 */
export function createUpcomingVotesResolver(opts: UpcomingVotesResolverOptions = {}) {
  const adapters: UpcomingVotesAdapter[] = [];
  if (opts.apiDataGovKey) {
    adapters.push(
      createCongressGovUpcomingAdapter({
        apiKey: opts.apiDataGovKey,
        fetcher: opts.fetcher,
        now: opts.now,
        baseUrl: opts.baseUrl,
      }),
    );
  }

  return {
    async list(
      filters: UpcomingEventsFilters,
    ): Promise<AdapterResult<UpcomingEvent[]>> {
      if (adapters.length === 0) return zeroKeyUnavailable();
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.list(filters);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "upcomingVotes",
        `no upcoming-votes source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.apiDataGov",
      );
    },
    adapterIds(): string[] {
      return adapters.map((adapter) => adapter.id);
    },
  };
}

export type UpcomingVotesResolver = ReturnType<typeof createUpcomingVotesResolver>;

function zeroKeyUnavailable<T>(): AdapterResult<T> {
  return unavailable(
    "upcomingVotes",
    "no upcoming-votes source configured",
    "set plugins.politiclaw.apiKeys.apiDataGov (free, https://api.data.gov/signup/)",
  );
}
