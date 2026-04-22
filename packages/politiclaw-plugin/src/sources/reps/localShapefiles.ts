import type { AdapterHealth, AdapterResult, SourceAdapter } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type { Rep, RepQuery } from "./types.js";
import { geocodeAddress, type GeocodeResult } from "./censusGeocoder.js";
import {
  CacheNotPrimedError,
  loadShapefileCache,
  primeShapefileCache,
  type LoadedShapefileCache,
} from "./shapefileCache.js";
import { findContainingDistrict } from "./pointInPolygon.js";
import { resolveFederalReps } from "./legislators.js";

type LocalAdapterOptions = {
  cacheDir: string;
  geocoder?: (address: string) => Promise<GeocodeResult>;
  cacheLoader?: (cacheDir: string) => LoadedShapefileCache;
  downloadPrimer?: (opts: { cacheDir: string; force?: boolean }) => Promise<unknown>;
  logger?: { info: (message: string) => void };
};

export function createLocalShapefilesAdapter(
  opts: LocalAdapterOptions,
): SourceAdapter<RepQuery, Rep[]> {
  const ID = "localShapefiles";
  const geocoder = opts.geocoder ?? ((address: string) => geocodeAddress(address));
  const cacheLoader = opts.cacheLoader ?? loadShapefileCache;
  const downloadPrimer =
    opts.downloadPrimer ??
    ((downloadOpts: { cacheDir: string; force?: boolean }) => primeShapefileCache(downloadOpts));
  const logger = opts.logger;

  return {
    id: ID,
    tier: 1,
    async health(): Promise<AdapterHealth> {
      try {
        cacheLoader(opts.cacheDir);
        return { status: "ok" };
      } catch (error) {
        if (error instanceof CacheNotPrimedError) {
          return {
            status: "degraded",
            reason: "shapefile cache not primed yet",
          };
        }
        return { status: "degraded", reason: "local shapefile cache unavailable" };
      }
    },
    async fetch(q: RepQuery): Promise<AdapterResult<Rep[]>> {
      let cache: LoadedShapefileCache;
      try {
        cache = cacheLoader(opts.cacheDir);
      } catch (error) {
        if (!(error instanceof CacheNotPrimedError)) {
          return unavailable(
            ID,
            "failed to read local shapefile cache",
            "run politiclaw_configure to rebuild the cache",
          );
        }
        logger?.info("PolitiClaw: priming shapefile cache (one-time, ~50 MB)");
        try {
          await downloadPrimer({ cacheDir: opts.cacheDir });
          cache = cacheLoader(opts.cacheDir);
        } catch (primeError) {
          const message = primeError instanceof Error ? primeError.message : String(primeError);
          return unavailable(
            ID,
            `unable to prime local shapefile cache (${message})`,
            "run politiclaw_configure and retry",
          );
        }
      }

      const geocoded = await geocoder(q.address);
      if (geocoded.status !== "ok") {
        return unavailable(ID, geocoded.reason, geocoded.actionable);
      }

      const district = findContainingDistrict({ lat: geocoded.lat, lon: geocoded.lon }, cache.polygons);
      if (!district) {
        return unavailable(
          ID,
          "no congressional district match for this coordinate",
          "check the address and retry",
        );
      }

      const reps = resolveFederalReps(cache.legislators, {
        state: district.state,
        houseDistrict: district.district,
      });
      if (reps.length === 0) {
        return unavailable(
          ID,
          `no federal legislators found for ${district.state}-${district.district}`,
          "refresh shapefile cache and retry",
        );
      }

      return {
        status: "ok",
        adapterId: ID,
        tier: 1,
        data: reps,
        fetchedAt: Date.now(),
      };
    },
  };
}
