/**
 * Adapter-agnostic campaign-finance shapes.
 *
 * Dollar amounts are **tier-1 authoritative only** (FEC OpenFEC for federal,
 * FollowTheMoney for state when configured). LLM search is never an
 * acceptable source for any numeric field in this module — enforced
 * structurally at the resolver boundary (see `src/sources/finance/index.ts`).
 */

/**
 * Canonical federal candidate identity. `candidateId` is the FEC id
 * (e.g. `H8CA12345`), durable across cycles; `name` and `office` are
 * convenience fields for rendering.
 */
export type FederalCandidateRef = {
  candidateId: string;
  name: string;
  party?: string;
  office?: "H" | "S" | "P";
  state?: string;
  district?: string;
  incumbentChallengeStatus?: string;
};

/**
 * Per-cycle financial totals for one federal candidate.
 *
 * Every numeric field is in whole dollars as reported to the FEC. Values are
 * null when the FEC response omits them (FEC legitimately omits fields for
 * cycles with no filings, new candidates, etc.) — the tool layer renders
 * those explicitly as "no data" rather than `$0`.
 */
export type FederalCandidateFinancialTotals = {
  candidateId: string;
  cycle: number;
  /** Total money raised (all sources). */
  receipts: number | null;
  /** Total money spent. */
  disbursements: number | null;
  /** Cash remaining at end of reporting period. */
  cashOnHandEndPeriod: number | null;
  /** From individual donors. */
  individualContributions: number | null;
  /** From PACs / other political committees. */
  pacContributions: number | null;
  /** Candidate self-funding (loans + contributions). */
  candidateSelfFunding: number | null;
  /** Independent expenditures supporting this candidate. */
  independentExpendituresInSupport: number | null;
  /** Independent expenditures opposing this candidate. */
  independentExpendituresInOpposition: number | null;
  /** FEC's `coverage_end_date` for the cycle, if present. */
  coverageEndDate?: string;
};

/**
 * Full research payload the resolver returns for a single candidate lookup.
 *
 * `totals` is a map from cycle → totals so callers can render "2024 vs 2022"
 * side-by-side without a second roundtrip. The FEC endpoint returns every
 * cycle the candidate has filed for; we preserve all of them and let the
 * tool layer pick which to render.
 */
export type FederalCandidateFinancialSummary = {
  candidate: FederalCandidateRef;
  totals: FederalCandidateFinancialTotals[];
};

/** Query filters for candidate search. */
export type CandidateSearchFilters = {
  /** Free-text name query, passed to FEC's `/candidates/search`. Optional when
   *  coordinate filters (office + state + optional district + cycle) are
   *  sufficient to pin a race — e.g. challenger lookup starts from a rep's
   *  district, not a name. The adapter accepts an empty/absent query in that
   *  case and relies on the coordinate filters. */
  nameQuery?: string;
  /** Optional cycle filter — narrows to candidates active in this cycle. */
  cycle?: number;
  /** Optional office filter — H (House), S (Senate), P (President). */
  office?: "H" | "S" | "P";
  /** Optional state filter (two-letter uppercase). */
  state?: string;
  /** Optional district filter (House only; two-digit string per FEC convention). */
  district?: string;
  /** Optional page size; FEC default is 20, max 100. */
  perPage?: number;
};
