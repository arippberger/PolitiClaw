/**
 * Web-search resolver — single entry point for tier-5 narrative adapters
 * (candidate bios, measure context). Mirrors `createBallotResolver` and
 * `createFinanceResolver`: adapter if a transport is wired, otherwise a
 * structured "unavailable" response with actionable guidance.
 */

import type { AdapterResult } from "../common/types.js";
import { createBiosAdapter } from "./bios.js";
import type {
  BioLookupQuery,
  BioPayload,
  WebSearchFetcher,
} from "./bios.js";

export type WebSearchResolverOptions = {
  fetcher?: WebSearchFetcher;
  now?: () => number;
};

export type WebSearchResolver = {
  bio(query: BioLookupQuery): Promise<AdapterResult<BioPayload>>;
};

export function createWebSearchResolver(
  options: WebSearchResolverOptions = {},
): WebSearchResolver {
  const adapter = createBiosAdapter(options);
  return {
    bio: (query) => adapter.fetch(query),
  };
}

export {
  createBiosAdapter,
  BIO_TIER_1_DOMAINS,
  BIO_TIER_2_DOMAINS,
} from "./bios.js";
export type {
  BioCitation,
  BioClaimCategory,
  BioLookupQuery,
  BioPayload,
  BiosAdapter,
  WebSearchFetcher,
} from "./bios.js";
