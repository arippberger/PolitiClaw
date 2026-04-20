import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createGoogleCivicBallotAdapter } from "./googleCivic.js";
import { createCaliforniaStateSoSBallotAdapter } from "./stateSoS/california.js";
import { createColoradoStateSoSBallotAdapter } from "./stateSoS/colorado.js";
import { createFloridaStateSoSBallotAdapter } from "./stateSoS/florida.js";
import { createMichiganStateSoSBallotAdapter } from "./stateSoS/michigan.js";
import { createOhioStateSoSBallotAdapter } from "./stateSoS/ohio.js";
import type { StateSoSBallotAdapter } from "./stateSoS/types.js";
import { createWashingtonStateSoSBallotAdapter } from "./stateSoS/washington.js";
import type { NormalizedBallotSnapshot } from "./types.js";

type Fetcher = typeof fetch;

export type BallotResolverOptions = {
  googleCivicApiKey?: string;
  fetcher?: Fetcher;
  stateSoSAdapters?: readonly StateSoSBallotAdapter[];
};

export type BallotResolver = {
  voterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>>;
};

/**
 * Ballot logistics resolver. Google Civic `voterInfoQuery` is the zero-cost
 * default path; Democracy Works can be added later as an optional upgrade.
 */
export function createBallotResolver(options: BallotResolverOptions): BallotResolver {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const stateAdapters = options.stateSoSAdapters ?? [
    createCaliforniaStateSoSBallotAdapter({ fetcher }),
    createWashingtonStateSoSBallotAdapter({ fetcher }),
    createColoradoStateSoSBallotAdapter({ fetcher }),
    createOhioStateSoSBallotAdapter({ fetcher }),
    createFloridaStateSoSBallotAdapter({ fetcher }),
    createMichiganStateSoSBallotAdapter({ fetcher }),
  ];
  const adapterByState = new Map(
    stateAdapters.map((adapter) => [adapter.stateCode, adapter] as const),
  );

  return {
    async voterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>> {
      const stateCode = parseStateCode(address);
      if (stateCode) {
        const stateAdapter = adapterByState.get(stateCode);
        if (stateAdapter) {
          const stateResult = await stateAdapter.fetchVoterInfo(address);
          if (stateResult.status === "ok") return stateResult;
        }
      }

      const apiKey = options.googleCivicApiKey?.trim();
      if (!apiKey) {
        if (stateCode && adapterByState.has(stateCode)) {
          return unavailable(
            "ballot",
            `No ballot source is configured for ${stateCode}: state adapter returned unavailable and Google Civic API key is not configured`,
            "Configure plugins.politiclaw.apiKeys.googleCivic, or finish wiring the state SoS adapter transport for this state.",
          );
        }
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

function parseStateCode(address: string): string | null {
  const trimmedAddress = address.trim();
  if (!trimmedAddress) return null;
  const pieces = trimmedAddress.split(",").map((piece) => piece.trim());
  for (let index = pieces.length - 1; index >= 0; index -= 1) {
    const piece = pieces[index];
    if (piece && /^[A-Za-z]{2}$/.test(piece)) {
      return piece.toUpperCase();
    }
  }
  return null;
}

export type { NormalizedBallotSnapshot } from "./types.js";
export { createGoogleCivicBallotAdapter, normalizeGoogleVoterInfoPayload } from "./googleCivic.js";
