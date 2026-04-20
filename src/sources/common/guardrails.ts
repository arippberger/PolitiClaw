/**
 * Hard guardrails on what LLM search / web_fetch output may represent.
 *
 * Some categories are never acceptable even when an API is unavailable. This
 * module makes that policy enforceable in code: every adapter under
 * `src/sources/webSearch/` must call {@link assertAllowedForLlmSearch}
 * before returning a payload.
 *
 * Callers outside `webSearch/` do not need this — the API-backed adapters
 * already have their own source-tier handling and don't route through here.
 */

export enum ForbiddenForLlmSearch {
  /** "How did Rep X vote on HR-Y?" — roll-call positions. */
  VOTE_POSITIONS = "VOTE_POSITIONS",
  /** "Is HR-Z passed / in committee?" — bill-status transitions. */
  BILL_STATUS = "BILL_STATUS",
  /** Any campaign-finance number (dollar amounts, donor ids, totals). */
  DOLLAR_AMOUNTS = "DOLLAR_AMOUNTS",
  /** Election dates, deadlines, polling-place addresses. */
  ELECTION_DATES = "ELECTION_DATES",
  /** Address → rep assignment. This is geometric; shapefiles or Geocodio only. */
  REP_TO_DISTRICT = "REP_TO_DISTRICT",
  /** Anything feeding the change-detection `snapshots` table. */
  SNAPSHOT_INPUT = "SNAPSHOT_INPUT",
}

export class GuardrailViolation extends Error {
  readonly category: ForbiddenForLlmSearch;

  constructor(category: ForbiddenForLlmSearch, context?: string) {
    const suffix = context ? ` (${context})` : "";
    super(
      `LLM search is not an acceptable source for ${category}${suffix}`,
    );
    this.name = "GuardrailViolation";
    this.category = category;
  }
}

/**
 * Throw {@link GuardrailViolation} if the provided category is in the
 * hard-guardrail set. Intended to be called at the top of every
 * `webSearch/*` adapter's `fetch()` with the semantic category the
 * adapter is about to produce.
 */
export function assertAllowedForLlmSearch(
  category: ForbiddenForLlmSearch | string,
  context?: string,
): void {
  if (isForbiddenCategory(category)) {
    throw new GuardrailViolation(category, context);
  }
}

export function isForbiddenCategory(
  category: ForbiddenForLlmSearch | string,
): category is ForbiddenForLlmSearch {
  return Object.values(ForbiddenForLlmSearch).includes(
    category as ForbiddenForLlmSearch,
  );
}

/**
 * Tier promotion rule: LLM-search output defaults to tier 5 at the fetch
 * boundary. A claim can be promoted to tier 1/2 only if *every* cited URL
 * resolves to a primary-government or neutral civic infrastructure domain.
 * Any mixed-tier citation keeps the whole claim at tier 5. This helper
 * implements that promotion check.
 */
export function promoteLlmSearchTier(
  citedUrls: readonly string[],
  tier1Domains: readonly string[],
  tier2Domains: readonly string[],
): 1 | 2 | 5 {
  if (citedUrls.length === 0) return 5;

  const hostnames: string[] = [];
  for (const raw of citedUrls) {
    try {
      hostnames.push(new URL(raw).hostname.toLowerCase());
    } catch {
      return 5;
    }
  }

  const allTier1 = hostnames.every((h) => matchesAny(h, tier1Domains));
  if (allTier1) return 1;

  const allTier1Or2 = hostnames.every(
    (h) => matchesAny(h, tier1Domains) || matchesAny(h, tier2Domains),
  );
  return allTier1Or2 ? 2 : 5;
}

function matchesAny(hostname: string, suffixes: readonly string[]): boolean {
  return suffixes.some((suffix) => {
    const normalized = suffix.toLowerCase().replace(/^\./, "");
    return hostname === normalized || hostname.endsWith(`.${normalized}`);
  });
}
