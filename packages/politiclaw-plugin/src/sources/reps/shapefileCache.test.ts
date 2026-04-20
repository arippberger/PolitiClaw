import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { CacheNotPrimedError, loadShapefileCache, primeShapefileCache } from "./shapefileCache.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixtureText(name: string): string {
  return readFileSync(join(FIXTURES_DIR, name), "utf8");
}

function fakeFetchFactory(
  responses: Record<string, { ok: boolean; status: number; body: string }>,
): typeof fetch {
  const fn = async (input: URL | string) => {
    const key = String(input);
    const item = responses[key];
    if (!item) throw new Error(`unexpected url ${key}`);
    return {
      ok: item.ok,
      status: item.status,
      async text() {
        return item.body;
      },
    } as unknown as Response;
  };
  return fn as unknown as typeof fetch;
}

describe("shapefile cache", () => {
  it("primes cache and loads parsed content", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    const result = await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    expect(result.status).toBe("primed");

    const loaded = loadShapefileCache(cacheDir);
    expect(loaded.polygons.features).toHaveLength(2);
    expect(loaded.legislators.length).toBeGreaterThan(0);
  });

  it("is idempotent when cache already exists", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const fetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    const second = await primeShapefileCache({ cacheDir, fetcher, districtsUrl, legislatorsUrl });
    expect(second.status).toBe("already_fresh");
  });

  it("keeps existing cache if force refresh fails partway", async () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    const districtsUrl = "https://example.test/districts.geojson";
    const legislatorsUrl = "https://example.test/legislators.yaml";
    const initialFetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: true, status: 200, body: fixtureText("legislators_subset.yaml") },
    });

    await primeShapefileCache({ cacheDir, fetcher: initialFetcher, districtsUrl, legislatorsUrl });
    const before = loadShapefileCache(cacheDir);

    const failingFetcher = fakeFetchFactory({
      [districtsUrl]: { ok: true, status: 200, body: fixtureText("districts_subset.geojson") },
      [legislatorsUrl]: { ok: false, status: 503, body: "" },
    });
    await expect(
      primeShapefileCache({
        cacheDir,
        force: true,
        fetcher: failingFetcher,
        districtsUrl,
        legislatorsUrl,
      }),
    ).rejects.toThrow("503");

    const after = loadShapefileCache(cacheDir);
    expect(after.manifest.downloadedAt).toBe(before.manifest.downloadedAt);
  });

  it("throws a typed error when cache is missing", () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "politiclaw-cache-"));
    expect(() => loadShapefileCache(cacheDir)).toThrow(CacheNotPrimedError);
  });
});
