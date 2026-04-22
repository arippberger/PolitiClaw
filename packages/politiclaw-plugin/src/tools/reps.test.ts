import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { upsertPreferences } from "../domain/preferences/index.js";
import { getMyRepsTool } from "./reps.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sources/reps/__fixtures__",
);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function stubFetch(body: unknown, ok = true) {
  return vi.fn(
    async () =>
      ({
        ok,
        status: ok ? 200 : 500,
        async json() {
          return body;
        },
      }) as unknown as Response,
  );
}

function withMemoryStorage() {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

beforeEach(() => {
  vi.stubGlobal("fetch", stubFetch(fixture("geocodio_ca12.json")));
});

afterEach(() => {
  resetStorageConfigForTests();
  vi.unstubAllGlobals();
});

describe("politiclaw_get_my_reps tool", () => {
  it("prompts to set preferences when no address is on file", async () => {
    withMemoryStorage();
    setPluginConfigForTests({ apiKeys: { geocodio: "k" } });

    const result = await getMyRepsTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("politiclaw_configure");
  });

  it("returns reps when preferences + geocodio key are present", async () => {
    const db = withMemoryStorage();
    upsertPreferences(db, { address: "123 Main St, San Francisco, CA", state: "ca" });
    setPluginConfigForTests({ apiKeys: { geocodio: "k" } });

    const result = await getMyRepsTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Nancy Pelosi");
    expect(text).toContain("geocodio");
    expect(text).toContain("tier 2");
  });

  it("returns an actionable unavailable message when no geocodio key is set", async () => {
    const db = withMemoryStorage();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });
    setPluginConfigForTests({ apiKeys: {} });

    const result = await getMyRepsTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("unavailable");
    expect(text).toContain("geocodio");
  });

  it("does not render undefined for House location fields", async () => {
    const db = withMemoryStorage();
    upsertPreferences(db, { address: "123 Main St", state: "ca" });
    setPluginConfigForTests({ apiKeys: { geocodio: "k" } });

    vi.stubGlobal(
      "fetch",
      stubFetch({
        results: [
          {
            fields: {
              congressional_districts: [
                {
                  district_number: 11,
                  current_legislators: [
                    {
                      type: "representative",
                      bio: { first_name: "Test", last_name: "Rep", party: "Independent" },
                      references: { bioguide_id: "T000001" },
                    },
                  ],
                },
              ],
            },
          },
        ],
      }),
    );

    const result = await getMyRepsTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("US House Unknown state-11");
    expect(text).not.toContain("undefined");
  });
});
