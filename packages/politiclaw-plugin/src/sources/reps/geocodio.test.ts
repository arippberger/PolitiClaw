import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createGeocodioAdapter } from "./geocodio.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function fixtureFetch(body: unknown, init: { ok?: boolean; status?: number } = {}): typeof fetch {
  const ok = init.ok ?? true;
  const status = init.status ?? 200;
  const fn = async () =>
    ({
      ok,
      status,
      async json() {
        return body;
      },
    }) as unknown as Response;
  return fn as unknown as typeof fetch;
}

describe("geocodio adapter", () => {
  it("returns senators + house rep from a valid response", async () => {
    const adapter = createGeocodioAdapter({
      apiKey: "k",
      fetcher: fixtureFetch(fixture("geocodio_ca12.json")),
      now: () => 1_700_000_000_000,
    });
    const result = await adapter.fetch({ address: "123 Main St, San Francisco, CA" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("geocodio");
    expect(result.tier).toBe(2);
    expect(result.fetchedAt).toBe(1_700_000_000_000);

    const offices = result.data.map((r) => r.office);
    expect(offices.filter((o) => o === "US Senate")).toHaveLength(2);
    expect(offices.filter((o) => o === "US House")).toHaveLength(1);

    const house = result.data.find((r) => r.office === "US House")!;
    expect(house.state).toBe("CA");
    expect(house.district).toBe("11");
    expect(house.id).toBe("P000197");
    expect(house.name).toBe("Nancy Pelosi");
  });

  it("returns unavailable without an api key", async () => {
    const adapter = createGeocodioAdapter({ apiKey: "", fetcher: fixtureFetch({}) });
    const result = await adapter.fetch({ address: "x" });
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable on a non-2xx response", async () => {
    const adapter = createGeocodioAdapter({
      apiKey: "k",
      fetcher: fixtureFetch({}, { ok: false, status: 401 }),
    });
    const result = await adapter.fetch({ address: "x" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("401");
  });

  it("returns unavailable when no district is found", async () => {
    const adapter = createGeocodioAdapter({
      apiKey: "k",
      fetcher: fixtureFetch({ results: [{ fields: { congressional_districts: [] } }] }),
    });
    const result = await adapter.fetch({ address: "x" });
    expect(result.status).toBe("unavailable");
  });

  it("returns unavailable when Geocodio includes an error field", async () => {
    const adapter = createGeocodioAdapter({
      apiKey: "k",
      fetcher: fixtureFetch({ error: "Invalid API key" }),
    });
    const result = await adapter.fetch({ address: "x" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("Invalid API key");
  });

  it("health reflects missing key", async () => {
    const missing = createGeocodioAdapter({ apiKey: "", fetcher: fixtureFetch({}) });
    const ok = createGeocodioAdapter({ apiKey: "k", fetcher: fixtureFetch({}) });
    expect((await missing.health()).status).toBe("unavailable");
    expect((await ok.health()).status).toBe("ok");
  });
});
