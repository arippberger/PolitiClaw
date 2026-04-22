import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { upsertPreferences } from "../domain/preferences/index.js";
import { openMemoryDb } from "../storage/sqlite.js";
import { Kv } from "../storage/kv.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { getMyBallotTool, renderGetMyBallotOutput } from "./ballot.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../sources/ballot/__fixtures__");

describe("renderGetMyBallotOutput", () => {
  it("surfaces missing preferences", () => {
    const text = renderGetMyBallotOutput({
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    });
    expect(text).toContain("politiclaw_configure");
  });

  it("announces polling count when count > 0 but no address data is present", () => {
    const text = renderGetMyBallotOutput({
      status: "ok",
      addressLine: "123 Main, 94110, CA",
      addressHash: "abc",
      fromCache: false,
      source: { adapterId: "googleCivic", tier: 2 },
      ballot: {
        normalizedInput: {},
        election: undefined,
        contests: [],
        primaryPolling: null,
        pollingLocationCount: 3,
        registrationUrl: null,
        electionAdministrationUrl: null,
      },
    });
    expect(text).toContain("3 locations returned");
    expect(text).toContain("state portal");
  });

  it("mentions registration link when ballot data is ok", () => {
    const text = renderGetMyBallotOutput({
      status: "ok",
      addressLine: "123 Main, 94110, CA",
      addressHash: "abc",
      fromCache: false,
      source: { adapterId: "googleCivic", tier: 2 },
      ballot: {
        normalizedInput: {},
        election: {
          id: "1",
          name: "General Election",
          electionDay: "2026-11-03",
          ocdDivisionId: "ocd-division/country:us",
        },
        contests: [
          {
            contestType: "General",
            office: "Governor",
            candidates: [{ name: "Taylor Example", party: "Independent" }],
          },
        ],
        primaryPolling: null,
        pollingLocationCount: 0,
        registrationUrl: "https://vote.example/register",
        electionAdministrationUrl: null,
      },
    });
    expect(text).toContain("https://vote.example/register");
    expect(text).toContain("Taylor Example");
    expect(text).toContain("PARTIAL");
  });
});

describe("politiclaw_get_my_ballot tool", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    configureStorage(() => "/tmp/politiclaw-ballot-tests");
    setStorageForTests({ db, kv: new Kv(db) });
    upsertPreferences(db, {
      address: "1600 Amphitheatre Parkway",
      zip: "94043",
      state: "CA",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStorageConfigForTests();
  });

  it("requires googleCivic api key", async () => {
    setPluginConfigForTests({ apiKeys: {} });

    const result = await getMyBallotTool.execute!("t1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Google Civic API key");
    expect(text).toContain("plugins.politiclaw.apiKeys.googleCivic");
  });

  it("fetches once and serves cache on second call", async () => {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "google_voterinfo_ca_2026-04-19.json"), "utf8"),
    );

    const fetcher = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          async json() {
            return fixture;
          },
        }) as unknown as Response,
    );

    vi.stubGlobal("fetch", fetcher);

    setPluginConfigForTests({
      apiKeys: { googleCivic: "fake-google-key" },
    });

    const first = await getMyBallotTool.execute!("t2", {}, undefined, undefined);
    const firstText = (first.content[0] as { type: "text"; text: string }).text;
    expect(firstText).toContain("California General Election");
    expect(firstText).toContain("informational, not independent journalism");
    expect(fetcher).toHaveBeenCalledTimes(1);

    const second = await getMyBallotTool.execute!("t3", {}, undefined, undefined);
    const secondText = (second.content[0] as { type: "text"; text: string }).text;
    expect(secondText).toContain("(cached snapshot)");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
