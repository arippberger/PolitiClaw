import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRepsResolver } from "./index.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function fixtureFetch(body: unknown, ok = true): typeof fetch {
  const fn = async () =>
    ({ ok, status: ok ? 200 : 500, async json() { return body; } }) as unknown as Response;
  return fn as unknown as typeof fetch;
}

describe("reps resolver", () => {
  it("prefers Geocodio when a key is configured", async () => {
    const resolver = createRepsResolver({
      geocodioApiKey: "k",
      fetcher: fixtureFetch(fixture("geocodio_ca12.json")),
    });
    const result = await resolver.resolve({ address: "123 Main St" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("geocodio");
  });

  it("falls back to shapefile (stubbed) when no key is configured", async () => {
    const resolver = createRepsResolver({
      localShapefiles: {
        cacheDir: "/tmp/not-used",
        geocoder: async () => ({ status: "ok", lat: 37.5, lon: -122.5 }),
        cacheLoader: () => ({
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
          ],
          manifest: {
            congress: 119,
            tigerYear: 2024,
            downloadedAt: new Date().toISOString(),
            cdSha256: "abc",
            legislatorsSha256: "def",
          },
        }),
      },
    });
    const result = await resolver.resolve({ address: "123 Main St" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("localShapefiles");
    expect(result.data).toHaveLength(3);
  });

  it("aggregates reasons from all adapters when none succeed", async () => {
    const resolver = createRepsResolver({
      geocodioApiKey: "k",
      fetcher: fixtureFetch({}, false),
    });
    const result = await resolver.resolve({ address: "123 Main St" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("geocodio");
    expect(result.reason).toContain("localShapefiles");
  });
});
