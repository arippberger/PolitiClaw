import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import {
  createCongressGovHouseVotesAdapter,
  type RollCallVoteAdapter,
} from "./congressGov.js";
import { createVoteviewSenateVotesAdapter } from "./voteview.js";
import type {
  RollCallVote,
  RollCallVoteListFilters,
  RollCallVoteRef,
  RollCallVoteWithMembers,
  VoteChamber,
} from "./types.js";

export type VotesResolverOptions = {
  apiDataGovKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  /** Override api.congress.gov base URL. */
  congressGovBaseUrl?: string;
  /** Override voteview.com base URL. */
  voteviewBaseUrl?: string;
};

/**
 * Resolver for roll-call votes across both chambers. Routes by chamber:
 *
 *   House  → api.congress.gov `/house-vote` (tier 1). Requires
 *            `plugins.politiclaw.apiKeys.apiDataGov`.
 *   Senate → voteview.com `/api/search` + `/api/download` (tier 2).
 *            No API key required.
 *
 * Missing primary sources surface as a structured "unavailable" result;
 * there is no LLM-search fallback, so the scoring layer treats a missing
 * primary as "insufficient data" rather than paraphrased positions.
 */
export function createVotesResolver(opts: VotesResolverOptions = {}) {
  const byChamber = new Map<VoteChamber, RollCallVoteAdapter[]>();

  if (opts.apiDataGovKey) {
    byChamber.set("House", [
      createCongressGovHouseVotesAdapter({
        apiKey: opts.apiDataGovKey,
        fetcher: opts.fetcher,
        now: opts.now,
        baseUrl: opts.congressGovBaseUrl,
      }),
    ]);
  }

  byChamber.set("Senate", [
    createVoteviewSenateVotesAdapter({
      fetcher: opts.fetcher,
      now: opts.now,
      baseUrl: opts.voteviewBaseUrl,
    }),
  ]);

  return {
    async list(
      filters: RollCallVoteListFilters,
    ): Promise<AdapterResult<RollCallVote[]>> {
      const adapters = byChamber.get(filters.chamber) ?? [];
      if (adapters.length === 0) return zeroKeyUnavailable(filters.chamber);
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.list(filters);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "votes",
        `no ${filters.chamber.toLowerCase()}-votes source available (${reasons.join("; ")})`,
        hintFor(filters.chamber),
      );
    },
    async getWithMembers(
      ref: RollCallVoteRef,
    ): Promise<AdapterResult<RollCallVoteWithMembers>> {
      const adapters = byChamber.get(ref.chamber) ?? [];
      if (adapters.length === 0) return zeroKeyUnavailable(ref.chamber);
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.getWithMembers(ref);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "votes",
        `no ${ref.chamber.toLowerCase()}-votes source available (${reasons.join("; ")})`,
        hintFor(ref.chamber),
      );
    },
    adapterIds(): string[] {
      const ids: string[] = [];
      for (const adapters of byChamber.values()) {
        for (const adapter of adapters) ids.push(adapter.id);
      }
      return ids;
    },
  };
}

export type VotesResolver = ReturnType<typeof createVotesResolver>;

function zeroKeyUnavailable<T>(chamber: VoteChamber): AdapterResult<T> {
  return unavailable(
    "votes",
    `no ${chamber.toLowerCase()}-votes source configured`,
    hintFor(chamber),
  );
}

function hintFor(chamber: VoteChamber): string {
  if (chamber === "House") {
    return "set plugins.politiclaw.apiKeys.apiDataGov (free, https://api.data.gov/signup/)";
  }
  return "voteview.com is zero-key; network access to voteview.com required";
}
