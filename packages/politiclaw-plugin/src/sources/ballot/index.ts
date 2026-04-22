import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createGoogleCivicBallotAdapter } from "./googleCivic.js";
import type { NormalizedBallotSnapshot } from "./types.js";

type Fetcher = typeof fetch;

export type BallotResolverOptions = {
  googleCivicApiKey?: string;
  fetcher?: Fetcher;
};

export type BallotResolver = {
  voterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>>;
};

/**
 * Ballot logistics resolver. Google Civic `voterInfoQuery` is the only source
 * wired in today. Per-state SoS adapters (CA/WA/CO/OH/FL/MI) were considered
 * and scoped out after an audit found none of those six states publishes a
 * public address-to-ballot JSON feed suitable for direct integration.
 */
export function createBallotResolver(options: BallotResolverOptions): BallotResolver {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);

  return {
    async voterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>> {
      const apiKey = options.googleCivicApiKey?.trim();
      if (!apiKey) {
        return unavailable(
          "ballot",
          "Google Civic API key is not configured",
          "Create a Google Cloud API key with the Civic Information API enabled, then set plugins.politiclaw.apiKeys.googleCivic.",
        );
      }

      const adapter = createGoogleCivicBallotAdapter({ apiKey, fetcher });
      return adapter.fetchVoterInfo(address);
    },
  };
}

export type { NormalizedBallotSnapshot } from "./types.js";
export { createGoogleCivicBallotAdapter, normalizeGoogleVoterInfoPayload } from "./googleCivic.js";
