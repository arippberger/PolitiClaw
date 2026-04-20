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
import {
  ingestHouseVotesTool,
  renderIngestHouseVotesOutput,
} from "./voteIngest.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sources/votes/__fixtures__",
);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

type FetchEntry = { match: (url: string) => boolean; body: unknown; ok?: boolean; status?: number };

function routeFetch(entries: FetchEntry[]) {
  return vi.fn(async (input: URL | string | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    for (const entry of entries) {
      if (entry.match(url)) {
        return {
          ok: entry.ok ?? true,
          status: entry.status ?? 200,
          async json() {
            return entry.body;
          },
        } as unknown as Response;
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

function withMemoryStorage() {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

beforeEach(() => {
  withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
  vi.unstubAllGlobals();
});

describe("renderIngestHouseVotesOutput", () => {
  it("renders a header + per-vote status lines for a first ingest", () => {
    const text = renderIngestHouseVotesOutput({
      status: "ok",
      source: { adapterId: "congressGov.houseVotes", tier: 1 },
      ingested: [
        {
          id: "house-119-1-17",
          status: "new",
          rollCallNumber: 17,
          billId: "119-hr-30",
          memberCount: 5,
        },
        {
          id: "house-119-1-42",
          status: "new",
          rollCallNumber: 42,
          billId: "119-hr-1234",
          memberCount: 2,
        },
      ],
    });

    expect(text).toContain("congressGov.houseVotes, tier 1");
    expect(text).toContain("2 new");
    expect(text).toContain("0 updated");
    expect(text).toContain("0 unchanged");
    expect(text).toContain("[new] house-119-1-17 (roll 17) bill=119-hr-30 members=5");
    expect(text).not.toContain("skipped");
  });

  it("surfaces skipped_unavailable rows with their reason + footer", () => {
    const text = renderIngestHouseVotesOutput({
      status: "ok",
      source: { adapterId: "congressGov.houseVotes", tier: 1 },
      ingested: [
        {
          id: "house-119-1-88",
          status: "skipped_unavailable",
          rollCallNumber: 88,
          billId: "119-hr-1234",
          memberCount: 0,
          reason: "api.congress.gov http 503",
        },
      ],
    });

    expect(text).toContain("1 skipped (detail unavailable)");
    expect(text).toContain("[skipped_unavailable] house-119-1-88");
    expect(text).toContain("http 503");
    expect(text).toContain("re-run to retry");
  });

  it("surfaces missing-apiDataGov unavailable with the actionable hint", () => {
    const text = renderIngestHouseVotesOutput({
      status: "unavailable",
      reason: "no house-votes source configured",
      actionable: "set plugins.politiclaw.apiKeys.apiDataGov",
    });

    expect(text).toContain("unavailable");
    expect(text).toContain("apiDataGov");
  });
});

describe("politiclaw_ingest_house_votes tool", () => {
  it("returns the rendered ingest summary and persists rows when apiDataGov is set", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) =>
            url.includes("/house-vote/119/1") &&
            !url.includes("/17") &&
            !url.includes("/42") &&
            !url.includes("/88"),
          body: fixture("congress_house_vote_list_119_1_2026-04-19.json"),
        },
        {
          match: (url) => url.includes("/house-vote/119/1/17/members"),
          body: fixture("congress_house_vote_members_119_1_17_2026-04-19.json"),
        },
        {
          match: (url) => url.includes("/house-vote/119/1/17"),
          body: fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
        },
        {
          match: (url) => url.includes("/house-vote/119/1/42/members"),
          body: fixture("congress_house_vote_members_119_1_42_2026-04-19.json"),
        },
        {
          match: (url) => url.includes("/house-vote/119/1/42"),
          body: fixture("congress_house_vote_detail_119_1_42_2026-04-19.json"),
        },
        {
          match: (url) => url.includes("/house-vote/119/1/88"),
          body: { error: { message: "x" } },
          ok: false,
          status: 503,
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await ingestHouseVotesTool.execute!(
      "call-1",
      { congress: 119, session: 1, limit: 10 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("2 new");
    expect(text).toContain("1 skipped");
    expect(text).toContain("house-119-1-17");
    expect(text).toContain("house-119-1-42");
    expect(text).toContain("house-119-1-88");
  });

  it("returns actionable unavailable when apiDataGov is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });

    const result = await ingestHouseVotesTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("unavailable");
    expect(text).toContain("apiDataGov");
  });

  it("rejects invalid session numbers", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await ingestHouseVotesTool.execute!(
      "call-1",
      { session: 3 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Invalid input");
  });
});
