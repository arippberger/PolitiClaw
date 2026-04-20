import type { AdapterResult } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createCongressGovAdapter, type BillsAdapter } from "./congressGov.js";
import type { Bill, BillListFilters, BillRef } from "./types.js";

export type BillsResolverOptions = {
  apiDataGovKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  baseUrl?: string;
};

/**
 * Resolver for federal bill lookups. The api.congress.gov adapter is the
 * primary source; without the one required `apiDataGov` key we return a
 * structured "unavailable" because no zero-key fallback is wired today.
 *
 * LLM search is never a valid fallback for bill-status transitions or
 * bill text.
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
        "configure plugins.politiclaw.apiKeys.apiDataGov",
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
    "set plugins.politiclaw.apiKeys.apiDataGov (free, https://api.data.gov/signup/) — no zero-key fallback is wired today",
  );
}
