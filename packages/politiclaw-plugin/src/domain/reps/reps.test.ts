import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "../../storage/sqlite.js";
import { upsertPreferences } from "../preferences/index.js";
import { createRepsResolver, type RepsResolver } from "../../sources/reps/index.js";
import type { Rep } from "../../sources/reps/types.js";
import { identifyMyReps, listReps } from "./index.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
  "sources/reps/__fixtures__",
);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function fixtureFetch(body: unknown): typeof fetch {
  const fn = async () =>
    ({ ok: true, status: 200, async json() { return body; } }) as unknown as Response;
  return fn as unknown as typeof fetch;
}

describe("identifyMyReps", () => {
  it("returns no_preferences when address is not set", async () => {
    const db = openMemoryDb();
    const resolver = createRepsResolver({
      geocodioApiKey: "k",
      fetcher: fixtureFetch(fixture("geocodio_ca12.json")),
    });
    const result = await identifyMyReps(db, resolver);
    expect(result.status).toBe("no_preferences");
  });

  it("fetches, persists, and returns reps on first call", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St, San Francisco, CA", state: "ca" });

    const resolver = createRepsResolver({
      geocodioApiKey: "k",
      fetcher: fixtureFetch(fixture("geocodio_ca12.json")),
    });
    const result = await identifyMyReps(db, resolver);

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.fromCache).toBe(false);
    expect(result.reps).toHaveLength(3);
    expect(result.source.adapterId).toBe("geocodio");
    expect(result.source.tier).toBe(2);

    const persisted = listReps(db);
    expect(persisted).toHaveLength(3);
    const house = persisted.find((r) => r.office === "US House")!;
    expect(house.district).toBe("11");
    expect(house.sourceAdapterId).toBe("geocodio");
  });

  it("returns cached reps on second call without re-fetching", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });

    let calls = 0;
    const countingFetcher: typeof fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        async json() {
          return fixture("geocodio_ca12.json");
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const resolver = createRepsResolver({ geocodioApiKey: "k", fetcher: countingFetcher });
    await identifyMyReps(db, resolver);
    expect(calls).toBe(1);

    const second = await identifyMyReps(db, resolver);
    expect(calls).toBe(1);
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.fromCache).toBe(true);
  });

  it("refresh=true bypasses the cache", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });

    let calls = 0;
    const countingFetcher: typeof fetch = (async () => {
      calls++;
      return {
        ok: true,
        status: 200,
        async json() {
          return fixture("geocodio_ca12.json");
        },
      } as unknown as Response;
    }) as unknown as typeof fetch;

    const resolver = createRepsResolver({ geocodioApiKey: "k", fetcher: countingFetcher });
    await identifyMyReps(db, resolver);
    await identifyMyReps(db, resolver, { refresh: true });
    expect(calls).toBe(2);
  });

  it("does not mix provenance when a later call wins with a different adapter", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });

    const adapterAReps: Rep[] = [
      { id: "A-house-1", name: "Alpha House", office: "US House", state: "CA", district: "11" },
      { id: "A-sen-1", name: "Alpha Senior", office: "US Senate", state: "CA" },
    ];
    const adapterBReps: Rep[] = [
      { id: "B-house-1", name: "Bravo House", office: "US House", state: "CA", district: "11" },
    ];

    const makeResolver = (adapterId: string, tier: 1 | 2, data: Rep[]): RepsResolver =>
      ({
        async resolve() {
          return { status: "ok", adapterId, tier, data, fetchedAt: Date.now() };
        },
        adapterIds() {
          return [adapterId];
        },
      }) as unknown as RepsResolver;

    const first = await identifyMyReps(db, makeResolver("adapter-a", 2, adapterAReps));
    expect(first.status).toBe("ok");

    const second = await identifyMyReps(db, makeResolver("adapter-b", 1, adapterBReps), {
      refresh: true,
    });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;

    // Every returned rep must match the winning adapter's metadata — no carry-over
    // from adapter-a's earlier rows.
    expect(second.source.adapterId).toBe("adapter-b");
    expect(second.reps.map((r) => r.id)).toEqual(["B-house-1"]);
    for (const rep of second.reps) {
      expect(rep.sourceAdapterId).toBe("adapter-b");
      expect(rep.sourceTier).toBe(1);
    }

    // DB state matches what was returned.
    const persisted = listReps(db);
    expect(persisted.map((r) => r.id)).toEqual(["B-house-1"]);
    expect(persisted.every((r) => r.sourceAdapterId === "adapter-b")).toBe(true);
  });

  it("returns unavailable when no resolver adapter succeeds", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });
    const resolver = createRepsResolver({
      localShapefiles: {
        cacheDir: "/tmp/not-used",
        cacheLoader: () => {
          throw new Error("test: shapefile cache unavailable");
        },
      },
    });
    const result = await identifyMyReps(db, resolver);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.actionable).toContain("geocodio");
  });
});
