import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createCongressGovAdapter, type BillsAdapter } from "./congressGov.js";
import { createUnitedstatesScraperAdapter } from "./unitedstatesScraper.js";
import type { Bill, BillListFilters, BillRef } from "./types.js";

type Fetcher = (input: URL | string | Request, init?: RequestInit) => Promise<Response>;

export type BillsResolverOptions = {
  apiDataGovKey?: string;
  /**
   * Base URL for a self-hosted `unitedstates/congress` scraper output mirror.
   * Activates the scraper fallback adapter. Supports `get(ref)` only — listing
   * still requires apiDataGov.
   */
  scraperBaseUrl?: string;
  fetcher?: Fetcher;
  now?: () => number;
  baseUrl?: string;
};

/**
 * Resolver for federal bill lookups. Adapter order:
 *   1. api.congress.gov (tier 1) when `apiDataGovKey` is set.
 *   2. unitedstates/congress scraper mirror (tier 2) when `scraperBaseUrl` is set.
 *
 * With neither configured, returns a structured "unavailable" naming both
 * config paths. LLM search is never a valid fallback for bill-status
 * transitions or bill text.
 */
export function createBillsResolver(opts: BillsResolverOptions = {}) {
  const adapters: BillsAdapter[] = [];

  if (opts.apiDataGovKey) {
    adapters.push(
      createCongressGovAdapter({
        apiKey: opts.apiDataGovKey,
        fetcher: opts.fetcher,
        now: opts.now,
        baseUrl: opts.baseUrl,
      }),
    );
  }

  if (opts.scraperBaseUrl) {
    adapters.push(
      createUnitedstatesScraperAdapter({
        baseUrl: opts.scraperBaseUrl,
        fetcher: opts.fetcher,
        now: opts.now,
      }),
    );
  }

  return {
    async list(filters: BillListFilters): Promise<AdapterResult<Bill[]>> {
      if (adapters.length === 0) return zeroKeyUnavailable();
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.list(filters);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "bills",
        `no bills source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.apiDataGov",
      );
    },
    async get(ref: BillRef): Promise<AdapterResult<Bill>> {
      if (adapters.length === 0) return zeroKeyUnavailable();
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.get(ref);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "bills",
        `no bills source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.apiDataGov (or plugins.politiclaw.sources.bills.scraperBaseUrl for self-hosted mirrors)",
      );
    },
    adapterIds(): string[] {
      return adapters.map((adapter) => adapter.id);
    },
  };
}

export type BillsResolver = ReturnType<typeof createBillsResolver>;

function zeroKeyUnavailable<T>(): AdapterResult<T> {
  return unavailable(
    "bills",
    "no federal bills source configured",
    "set plugins.politiclaw.apiKeys.apiDataGov (free, https://api.data.gov/signup/) or plugins.politiclaw.sources.bills.scraperBaseUrl (self-hosted unitedstates/congress mirror, single-bill lookups only)",
  );
}
