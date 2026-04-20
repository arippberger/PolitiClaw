import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createFecAdapter } from "./fec.js";
import type {
  CandidateSearchFilters,
  FederalCandidateFinancialSummary,
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
} from "./types.js";

type Fetcher = typeof fetch;

export type FinanceResolverOptions = {
  apiDataGovKey?: string;
  fetcher?: Fetcher;
  now?: () => number;
  /** Override for tests only. */
  baseUrl?: string;
};

/**
 * Campaign-finance resolver. Every numeric claim this resolver returns is
 * tier-1 authoritative — LLM search is never an acceptable source for dollar
 * amounts, donor identities, or contribution totals, and there is no code
 * path in this module that accepts such input.
 *
 * This resolver currently covers federal candidates via FEC OpenFEC (shares
 * the `apiDataGov` key with api.congress.gov). State finance
 * (FollowTheMoney) and industry rollups (OpenSecrets) are optional follow-up
 * integrations.
 */
export type FinanceResolver = {
  searchCandidates(
    filters: CandidateSearchFilters,
  ): Promise<AdapterResult<FederalCandidateRef[]>>;
  getCandidateSummary(
    candidateId: string,
  ): Promise<AdapterResult<FederalCandidateFinancialSummary>>;
  getCandidateTotals(
    candidateId: string,
    cycle?: number,
  ): Promise<AdapterResult<FederalCandidateFinancialTotals[]>>;
};

const MISSING_KEY_REASON = "api.data.gov key is not configured";
const MISSING_KEY_ACTIONABLE =
  "Set plugins.politiclaw.apiKeys.apiDataGov — one key covers both api.congress.gov and FEC OpenFEC.";

export function createFinanceResolver(options: FinanceResolverOptions): FinanceResolver {
  const key = options.apiDataGovKey?.trim();

  return {
    async searchCandidates(
      filters: CandidateSearchFilters,
    ): Promise<AdapterResult<FederalCandidateRef[]>> {
      if (!key) {
        return unavailable("finance", MISSING_KEY_REASON, MISSING_KEY_ACTIONABLE);
      }
      const adapter = createFecAdapter({
        apiKey: key,
        fetcher: options.fetcher,
        baseUrl: options.baseUrl,
        now: options.now,
      });
      return adapter.searchCandidates(filters);
    },

    async getCandidateSummary(
      candidateId: string,
    ): Promise<AdapterResult<FederalCandidateFinancialSummary>> {
      if (!key) {
        return unavailable("finance", MISSING_KEY_REASON, MISSING_KEY_ACTIONABLE);
      }
      const adapter = createFecAdapter({
        apiKey: key,
        fetcher: options.fetcher,
        baseUrl: options.baseUrl,
        now: options.now,
      });
      return adapter.getCandidateSummary(candidateId);
    },

    async getCandidateTotals(
      candidateId: string,
      cycle?: number,
    ): Promise<AdapterResult<FederalCandidateFinancialTotals[]>> {
      if (!key) {
        return unavailable("finance", MISSING_KEY_REASON, MISSING_KEY_ACTIONABLE);
      }
      const adapter = createFecAdapter({
        apiKey: key,
        fetcher: options.fetcher,
        baseUrl: options.baseUrl,
        now: options.now,
      });
      return adapter.getCandidateTotals(candidateId, cycle);
    },
  };
}

export { createFecAdapter } from "./fec.js";
export type {
  CandidateSearchFilters,
  FederalCandidateFinancialSummary,
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
} from "./types.js";
