import { describe, expect, it, vi } from "vitest";
import type { Rep } from "./types.js";
import { createLocalShapefilesAdapter } from "./localShapefiles.js";
import { CacheNotPrimedError, type LoadedShapefileCache } from "./shapefileCache.js";

function fakeCache(): LoadedShapefileCache {
  return {
    polygons: {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: { STATEFP: "06", CD119FP: "11" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-123, 37],
                [-122, 37],
                [-122, 38],
                [-123, 38],
                [-123, 37],
              ],
            ],
          },
        },
      ],
    },
    legislators: [
      { bioguide: "P000145", name: "Alex Padilla", office: "US Senate", state: "CA" },
      { bioguide: "S001150", name: "Adam Schiff", office: "US Senate", state: "CA" },
      {
        bioguide: "P000197",
        name: "Nancy Pelosi",
        office: "US House",
        state: "CA",
        district: "11",
      },
    ] as Rep[],
    manifest: {
      congress: 119,
      tigerYear: 2024,
      downloadedAt: new Date().toISOString(),
      cdSha256: "abc",
      legislatorsSha256: "def",
    },
  };
}

describe("local shapefile adapter", () => {
  it("returns federal reps from geocoder + polygons + legislators", async () => {
    const adapter = createLocalShapefilesAdapter({
      cacheDir: "/tmp/not-used",
      geocoder: async () => ({ status: "ok", lat: 37.5, lon: -122.5 }),
      cacheLoader: () => fakeCache(),
    });
    const result = await adapter.fetch({ address: "123 Main St" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(3);
    expect(result.data.some((item) => item.name === "Nancy Pelosi")).toBe(true);
  });

  it("autoprimes when cache is cold", async () => {
    let loadCalls = 0;
    const primer = vi.fn(async () => undefined);
    const adapter = createLocalShapefilesAdapter({
      cacheDir: "/tmp/not-used",
      geocoder: async () => ({ status: "ok", lat: 37.5, lon: -122.5 }),
      cacheLoader: () => {
        loadCalls += 1;
        if (loadCalls === 1) throw new CacheNotPrimedError("missing");
        return fakeCache();
      },
      downloadPrimer: primer,
    });

    const result = await adapter.fetch({ address: "123 Main St" });
    expect(result.status).toBe("ok");
    expect(primer).toHaveBeenCalledTimes(1);
  });

  it("returns unavailable if geocoder cannot resolve the address", async () => {
    const adapter = createLocalShapefilesAdapter({
      cacheDir: "/tmp/not-used",
      geocoder: async () => ({
        status: "unavailable",
        reason: "no match",
        actionable: "retry",
      }),
      cacheLoader: () => fakeCache(),
    });
    const result = await adapter.fetch({ address: "bad" });
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable if autoprime fails", async () => {
    const adapter = createLocalShapefilesAdapter({
      cacheDir: "/tmp/not-used",
      geocoder: async () => ({ status: "ok", lat: 37.5, lon: -122.5 }),
      cacheLoader: () => {
        throw new CacheNotPrimedError("missing");
      },
      downloadPrimer: async () => {
        throw new Error("network failure");
      },
    });
    const result = await adapter.fetch({ address: "123 Main St" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("unable to prime");
  });
});
