import { join } from "node:path";
import type { AdapterResult, SourceAdapter } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { createGeocodioAdapter } from "./geocodio.js";
import { createLocalShapefilesAdapter } from "./localShapefiles.js";
import type { Rep, RepQuery } from "./types.js";

export type RepsResolverOptions = {
  geocodioApiKey?: string;
  fetcher?: typeof fetch;
  now?: () => number;
  stateDir?: string;
  localShapefiles?: Parameters<typeof createLocalShapefilesAdapter>[0];
};

/**
 * Representative resolver order:
 *   1. Geocodio (optional upgrade) if a key is configured.
 *   2. Local shapefile pipeline (zero-key default).
 *   3. Structured "unavailable" with an actionable message.
 *
 * LLM search is explicitly NOT a fallback for rep identity; address-to-
 * district resolution must come from shapefiles or an address API.
 */
export function createRepsResolver(opts: RepsResolverOptions = {}) {
  const adapters: SourceAdapter<RepQuery, Rep[]>[] = [];

  if (opts.geocodioApiKey) {
    adapters.push(
      createGeocodioAdapter({
        apiKey: opts.geocodioApiKey,
        fetcher: opts.fetcher,
        now: opts.now,
      }),
    );
  }
  const localShapefileAdapterOptions =
    opts.localShapefiles ??
    ({
      cacheDir: join(opts.stateDir ?? process.cwd(), "plugins", "politiclaw", "shapefiles"),
    } as Parameters<typeof createLocalShapefilesAdapter>[0]);
  adapters.push(createLocalShapefilesAdapter(localShapefileAdapterOptions));

  return {
    async resolve(q: RepQuery): Promise<AdapterResult<Rep[]>> {
      const reasons: string[] = [];
      for (const adapter of adapters) {
        const result = await adapter.fetch(q);
        if (result.status === "ok") return result;
        reasons.push(`${adapter.id}: ${result.reason}`);
      }
      return unavailable(
        "reps",
        `no rep source available (${reasons.join("; ")})`,
        "configure plugins.politiclaw.apiKeys.geocodio or run politiclaw_configure to prime the local rep cache",
      );
    },
    adapterIds(): string[] {
      return adapters.map((a) => a.id);
    },
  };
}

export type RepsResolver = ReturnType<typeof createRepsResolver>;
