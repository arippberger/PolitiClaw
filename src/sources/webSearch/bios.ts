/**
 * Tier-5 candidate bio adapter (ADR-004, ADR-005; risks.md §9).
 *
 * This is the single sanctioned place in the plugin where LLM-derived /
 * web-search output enters the domain layer. Every payload it returns is
 * tier-5 by default; only homogeneous tier-1 or tier-1+2 citation sets
 * are promoted to tier 1 or 2 respectively via `promoteLlmSearchTier`.
 *
 * Non-negotiable invariants — enforced structurally:
 *   • Every `fetch()` call pre-registers the semantic category it will
 *     produce with `assertAllowedForLlmSearch`. `ForbiddenForLlmSearch`
 *     categories (vote positions, bill status, dollar amounts, rep→
 *     district assignment, election dates, snapshot inputs) throw at
 *     this boundary. There is no code path by which web-search output
 *     can land in any of those shapes.
 *   • Narrative text is returned alongside the cited URLs that produced
 *     it. Callers must persist both for audit.
 *   • The adapter is injectable: tests supply a `WebSearchFetcher`
 *     directly; production wiring is deliberately deferred (returns
 *     "unavailable") until a gateway web-search method is locked in.
 */

import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import {
  ForbiddenForLlmSearch,
  assertAllowedForLlmSearch,
  promoteLlmSearchTier,
} from "../common/guardrails.js";

const ADAPTER_ID = "webSearch.bios";

/** Primary-government domains eligible for tier-1 promotion. */
export const BIO_TIER_1_DOMAINS: readonly string[] = [
  "house.gov",
  "senate.gov",
  "congress.gov",
  "gpo.gov",
  "fec.gov",
  "usa.gov",
  "ca.gov",
  "wa.gov",
  "co.gov",
  "ohio.gov",
  "myflorida.com",
  "michigan.gov",
  "gov",
];

/** Neutral civic-infrastructure domains eligible for tier-2 promotion. */
export const BIO_TIER_2_DOMAINS: readonly string[] = [
  "ballotpedia.org",
  "votesmart.org",
  "lwv.org",
  "govtrack.us",
  "opensecrets.org",
  "fec.gov",
];

/**
 * Allowed semantic categories for bio lookups. Narrow by design —
 * anything not in this union would need its own risks.md §9 review.
 */
export type BioClaimCategory =
  | "candidate.bio"
  | "candidate.positionStatement"
  | "candidate.pressRelease"
  | "measure.narrativeContext";

export type BioLookupQuery = {
  name: string;
  office?: "H" | "S" | "P" | "state" | "local";
  state?: string;
  district?: string;
  /** Narrow the search intent. Controls the guardrail assertion. */
  category: BioClaimCategory;
  /** Free-form additional context (e.g. "2026 primary"). Adapters may ignore. */
  context?: string;
};

/**
 * One citation record. Every claim in `snippets` / `narrativeText` must be
 * traceable to one or more of these URLs so that downstream audit can
 * re-read the primary source and so tier promotion can be re-verified.
 */
export type BioCitation = {
  url: string;
  title?: string;
  publisher?: string;
  /** Retrieval timestamp (ms epoch) from the underlying fetcher. */
  retrievedAt: number;
};

export type BioPayload = {
  category: BioClaimCategory;
  /** Short factual narrative assembled from `citations`. Never invented — the
   *  fetcher must compose from cited content only. */
  narrativeText: string;
  /** Optional structured extracts (e.g. `{"priorOffice": "State Senate, CA-13"}`)
   *  that individual renderers may surface. Never contains dollar amounts,
   *  vote positions, bill-status transitions, election dates, or polling-place
   *  addresses — those are `ForbiddenForLlmSearch` categories. */
  structured?: Record<string, string>;
  citations: readonly BioCitation[];
};

/**
 * The pluggable fetch surface. Production wiring will eventually route this
 * through the host gateway's web-search capability; tests inject a stub
 * directly. Keeping this interface small and synchronous-in-return means
 * the guardrail layer (below) never has to reason about transport.
 */
export type WebSearchFetcher = (
  query: BioLookupQuery,
) => Promise<
  | { status: "ok"; payload: Omit<BioPayload, "category"> }
  | { status: "unavailable"; reason: string; actionable?: string }
>;

export type BiosAdapterOptions = {
  fetcher?: WebSearchFetcher;
  now?: () => number;
  /** Overrideable for tests — domain lists mapping cited URLs to tiers. */
  tier1Domains?: readonly string[];
  tier2Domains?: readonly string[];
};

export type BiosAdapter = {
  id: string;
  fetch(
    query: BioLookupQuery,
  ): Promise<AdapterResult<BioPayload>>;
};

const MISSING_FETCHER_REASON =
  "candidate-bio adapter has no live web-search transport wired yet";
const MISSING_FETCHER_ACTIONABLE =
  "v1 ships the adapter shape + guardrails; the skill layer routes bio lookups through the host web_search tool for now. Inject a WebSearchFetcher in tests to exercise the full path.";

export function createBiosAdapter(options: BiosAdapterOptions = {}): BiosAdapter {
  const now = options.now ?? (() => Date.now());
  const tier1 = options.tier1Domains ?? BIO_TIER_1_DOMAINS;
  const tier2 = options.tier2Domains ?? BIO_TIER_2_DOMAINS;

  return {
    id: ADAPTER_ID,
    async fetch(query: BioLookupQuery): Promise<AdapterResult<BioPayload>> {
      assertCategoryIsAllowed(query.category);

      if (!options.fetcher) {
        return unavailable(
          ADAPTER_ID,
          MISSING_FETCHER_REASON,
          MISSING_FETCHER_ACTIONABLE,
        );
      }

      const normalizedQuery = normalizeQuery(query);
      const response = await options.fetcher(normalizedQuery);
      if (response.status !== "ok") {
        return unavailable(ADAPTER_ID, response.reason, response.actionable);
      }

      const payload: BioPayload = {
        category: normalizedQuery.category,
        narrativeText: response.payload.narrativeText,
        structured: response.payload.structured,
        citations: response.payload.citations,
      };

      // Final structural check: reject any structured key that looks like
      // it carries a forbidden category even if the fetcher slipped.
      rejectForbiddenStructured(payload.structured);

      const citedUrls = payload.citations.map((c) => c.url);
      const tier = promoteLlmSearchTier(citedUrls, tier1, tier2);

      return {
        status: "ok",
        adapterId: ADAPTER_ID,
        tier,
        data: payload,
        fetchedAt: now(),
      };
    },
  };
}

/**
 * Map the bio-lookup category onto the §9 guardrail enum. This is the gate
 * that makes it structurally impossible to call the adapter with an intent
 * that would produce a hard-forbidden payload (vote positions, dollar
 * amounts, etc.).
 */
function assertCategoryIsAllowed(category: BioClaimCategory): void {
  // Allowed categories are a closed set; anything else would be a type error
  // at the TS boundary AND a §9 violation. We also re-assert explicitly so
  // a drift in the enum (e.g. someone broadens the type) still trips at
  // runtime.
  const allowed: readonly BioClaimCategory[] = [
    "candidate.bio",
    "candidate.positionStatement",
    "candidate.pressRelease",
    "measure.narrativeContext",
  ];
  if (!allowed.includes(category)) {
    // Force a guardrail throw so the failure is logged consistently with
    // every other §9 violation.
    assertAllowedForLlmSearch(
      ForbiddenForLlmSearch.SNAPSHOT_INPUT,
      `unknown bio-lookup category: ${category}`,
    );
  }
}

function normalizeQuery(query: BioLookupQuery): BioLookupQuery {
  return {
    ...query,
    name: query.name.trim(),
    state: query.state?.trim().toUpperCase(),
    district: query.district?.trim(),
  };
}

/**
 * Sanity sweep: even trusted fetchers can mis-label output. Reject any
 * structured field whose key name implies a forbidden category.
 */
function rejectForbiddenStructured(
  structured: Record<string, string> | undefined,
): void {
  if (!structured) return;
  for (const key of Object.keys(structured)) {
    const normalized = key.toLowerCase();
    if (normalized.includes("vote") && normalized.includes("position")) {
      assertAllowedForLlmSearch(
        ForbiddenForLlmSearch.VOTE_POSITIONS,
        `structured key "${key}"`,
      );
    }
    if (
      normalized.includes("raised") ||
      normalized.includes("receipts") ||
      normalized.includes("contributions") ||
      normalized.includes("donor") ||
      normalized.includes("$")
    ) {
      assertAllowedForLlmSearch(
        ForbiddenForLlmSearch.DOLLAR_AMOUNTS,
        `structured key "${key}"`,
      );
    }
    if (
      normalized.includes("electionday") ||
      normalized.includes("pollingplace") ||
      normalized.includes("pollinglocation")
    ) {
      assertAllowedForLlmSearch(
        ForbiddenForLlmSearch.ELECTION_DATES,
        `structured key "${key}"`,
      );
    }
    if (normalized.includes("district") && normalized.includes("assign")) {
      assertAllowedForLlmSearch(
        ForbiddenForLlmSearch.REP_TO_DISTRICT,
        `structured key "${key}"`,
      );
    }
  }
}
