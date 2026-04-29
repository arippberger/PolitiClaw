import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type {
  CandidateSearchFilters,
  FederalCandidateFinancialSummary,
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
} from "./types.js";

type Fetcher = typeof fetch;

const BASE_URL = "https://api.open.fec.gov/v1";
const ADAPTER_ID = "fec";
const TIER: SourceTier = 1;

export type FecAdapterOptions = {
  /**
   * `api.data.gov` key. OpenFEC shares the same key namespace as
   * api.congress.gov, so the plugin config key is `apiDataGov`, not a
   * separate `openFec`.
   */
  apiKey: string;
  fetcher?: Fetcher;
  baseUrl?: string;
  now?: () => number;
};

type FecCandidateSearchRow = {
  candidate_id?: string;
  name?: string;
  party?: string;
  party_full?: string;
  office?: string;
  office_full?: string;
  state?: string;
  district?: string | number;
  incumbent_challenge?: string;
  incumbent_challenge_full?: string;
};

type FecPaginatedResponse<T> = {
  api_version?: string;
  pagination?: { count?: number; page?: number; pages?: number; per_page?: number };
  results?: T[];
  message?: string;
  error?: string;
};

type FecCandidateTotalsRow = {
  candidate_id?: string;
  cycle?: number;
  receipts?: number | null;
  disbursements?: number | null;
  cash_on_hand_end_period?: number | null;
  individual_contributions?: number | null;
  other_political_committee_contributions?: number | null;
  candidate_contribution?: number | null;
  coverage_end_date?: string | null;
};

export interface FecAdapter {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
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
}

function normalizeOffice(raw?: string): FederalCandidateRef["office"] {
  if (raw === "H" || raw === "S" || raw === "P") return raw;
  return undefined;
}

function normalizeCandidateRef(row: FecCandidateSearchRow): FederalCandidateRef | null {
  if (!row.candidate_id || !row.name) return null;
  return {
    candidateId: row.candidate_id,
    name: row.name,
    party: row.party_full ?? row.party,
    office: normalizeOffice(row.office),
    state: row.state,
    district: row.district !== undefined && row.district !== null ? String(row.district) : undefined,
    incumbentChallengeStatus: row.incumbent_challenge_full ?? row.incumbent_challenge,
  };
}

function toNullableNumber(value: number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  return value;
}

function normalizeTotalsRow(
  row: FecCandidateTotalsRow,
): FederalCandidateFinancialTotals | null {
  if (!row.candidate_id || typeof row.cycle !== "number") return null;
  const coverageEndDate = row.coverage_end_date
    ? row.coverage_end_date.slice(0, 10)
    : undefined;
  return {
    candidateId: row.candidate_id,
    cycle: row.cycle,
    receipts: toNullableNumber(row.receipts),
    disbursements: toNullableNumber(row.disbursements),
    cashOnHandEndPeriod: toNullableNumber(row.cash_on_hand_end_period),
    individualContributions: toNullableNumber(row.individual_contributions),
    pacContributions: toNullableNumber(row.other_political_committee_contributions),
    candidateSelfFunding: toNullableNumber(row.candidate_contribution),
    independentExpendituresInSupport: null,
    independentExpendituresInOpposition: null,
    coverageEndDate,
  };
}

function extractFecError(
  response: Response,
  body: FecPaginatedResponse<unknown>,
): string {
  const message = body.message ?? body.error;
  return message ? `${message} (HTTP ${response.status})` : `HTTP ${response.status}`;
}

export function createFecAdapter(options: FecAdapterOptions): FecAdapter {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? BASE_URL;
  const now = options.now ?? Date.now;

  async function getJson<T>(
    path: string,
    params: Record<string, string | number | undefined>,
  ): Promise<
    | { status: "ok"; body: FecPaginatedResponse<T> }
    | { status: "error"; reason: string }
  > {
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("api_key", options.apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }

    let response: Response;
    try {
      response = await fetcher(url.toString(), { method: "GET" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { status: "error", reason: `FEC network error: ${message}` };
    }

    let parsed: unknown;
    try {
      parsed = await response.json();
    } catch {
      return {
        status: "error",
        reason: `FEC returned non-JSON (HTTP ${response.status})`,
      };
    }

    const body = parsed as FecPaginatedResponse<T>;
    if (!response.ok) {
      return { status: "error", reason: `FEC request failed: ${extractFecError(response, body)}` };
    }
    return { status: "ok", body };
  }

  return {
    id: ADAPTER_ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      return { status: "ok" };
    },

    async searchCandidates(
      filters: CandidateSearchFilters,
    ): Promise<AdapterResult<FederalCandidateRef[]>> {
      const query = filters.nameQuery?.trim() ?? "";
      const hasCoordinateFilters = Boolean(filters.office && filters.state);
      if (query.length === 0 && !hasCoordinateFilters) {
        return unavailable(
          ADAPTER_ID,
          "nameQuery is empty and no race coordinates were provided",
          "Pass a candidate name, or pass office + state (+ district for House).",
        );
      }

      // FEC's coordinate-filtered endpoint is `/candidates/` (list by race);
      // `/candidates/search/` is required only when a free-text `q` is set.
      const path = query.length > 0 ? "/candidates/search/" : "/candidates/";
      const result = await getJson<FecCandidateSearchRow>(path, {
        q: query.length > 0 ? query : undefined,
        cycle: filters.cycle,
        office: filters.office,
        state: filters.state,
        district: filters.district,
        per_page: filters.perPage ?? 20,
      });

      if (result.status === "error") {
        return unavailable(ADAPTER_ID, result.reason);
      }

      const rows = (result.body.results ?? [])
        .map(normalizeCandidateRef)
        .filter((ref): ref is FederalCandidateRef => ref !== null);

      return {
        status: "ok",
        adapterId: ADAPTER_ID,
        tier: TIER,
        data: rows,
        fetchedAt: now(),
      };
    },

    async getCandidateTotals(
      candidateId: string,
      cycle?: number,
    ): Promise<AdapterResult<FederalCandidateFinancialTotals[]>> {
      const trimmed = candidateId.trim();
      if (trimmed.length === 0) {
        return unavailable(ADAPTER_ID, "candidateId is empty", "Pass the FEC candidate id.");
      }
      const result = await getJson<FecCandidateTotalsRow>(
        `/candidate/${encodeURIComponent(trimmed)}/totals/`,
        { per_page: 20, sort: "-cycle", cycle },
      );
      if (result.status === "error") {
        return unavailable(ADAPTER_ID, result.reason);
      }
      const totals = (result.body.results ?? [])
        .map(normalizeTotalsRow)
        .filter((row): row is FederalCandidateFinancialTotals => row !== null);
      return {
        status: "ok",
        adapterId: ADAPTER_ID,
        tier: TIER,
        data: totals,
        fetchedAt: now(),
      };
    },

    async getCandidateSummary(
      candidateId: string,
    ): Promise<AdapterResult<FederalCandidateFinancialSummary>> {
      const trimmed = candidateId.trim();
      if (trimmed.length === 0) {
        return unavailable(ADAPTER_ID, "candidateId is empty", "Pass the FEC candidate id.");
      }

      const [candidateLookup, totalsLookup] = await Promise.all([
        getJson<FecCandidateSearchRow>(`/candidate/${encodeURIComponent(trimmed)}/`, {}),
        getJson<FecCandidateTotalsRow>(
          `/candidate/${encodeURIComponent(trimmed)}/totals/`,
          { per_page: 20, sort: "-cycle" },
        ),
      ]);

      if (candidateLookup.status === "error") {
        return unavailable(ADAPTER_ID, candidateLookup.reason);
      }
      const firstCandidateRow = candidateLookup.body.results?.[0];
      const candidate = firstCandidateRow ? normalizeCandidateRef(firstCandidateRow) : null;
      if (!candidate) {
        return unavailable(
          ADAPTER_ID,
          `no FEC candidate found for id ${trimmed}`,
          "Confirm the FEC candidate id (e.g. H8CA12345) via politiclaw_research_finance with mode='candidate' and a name search.",
        );
      }

      // Totals failure is not fatal: we still return the candidate ref with
      // an empty totals array and let the tool explain the gap. Numeric
      // fields stay tier-1 or absent — never backfilled from another tier.
      const totals =
        totalsLookup.status === "ok"
          ? (totalsLookup.body.results ?? [])
              .map(normalizeTotalsRow)
              .filter((row): row is FederalCandidateFinancialTotals => row !== null)
          : [];

      return {
        status: "ok",
        adapterId: ADAPTER_ID,
        tier: TIER,
        data: { candidate, totals },
        fetchedAt: now(),
      };
    },
  };
}
