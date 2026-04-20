import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { geocodeAddress } from "./censusGeocoder.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function fixtureFetch(body: unknown, ok = true): typeof fetch {
  const fn = async () =>
    ({ ok, status: ok ? 200 : 500, async json() { return body; } }) as unknown as Response;
  return fn as unknown as typeof fetch;
}

describe("census geocoder", () => {
  it("returns lat/lon for a valid address", async () => {
    const result = await geocodeAddress("123 Main St, San Francisco, CA", {
      fetcher: fixtureFetch(fixture("census_geocoder_123main.json")),
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.lat).toBe(37.761136);
    expect(result.lon).toBe(-122.446381);
  });

  it("returns unavailable when no matches are returned", async () => {
    const result = await geocodeAddress("unknown address", {
      fetcher: fixtureFetch({ result: { addressMatches: [] } }),
    });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("no coordinate match");
  });

  it("returns unavailable on HTTP errors", async () => {
    const result = await geocodeAddress("123 Main St", {
      fetcher: fixtureFetch({}, false),
    });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("http 500");
  });
});
