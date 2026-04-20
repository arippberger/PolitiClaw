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
import { upsertIssueStance } from "../domain/preferences/index.js";
import { checkUpcomingVotesTool } from "./monitoring.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BILLS_FIXTURES = join(HERE, "..", "sources/bills/__fixtures__");
const EVENTS_FIXTURES = join(HERE, "..", "sources/upcomingVotes/__fixtures__");

function fixture(base: string, name: string): unknown {
  return JSON.parse(readFileSync(join(base, name), "utf8"));
}

type Route = { match: (url: string) => boolean; body: unknown; status?: number };

function routeFetch(routes: Route[]) {
  return vi.fn(async (input: URL | string | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    for (const route of routes) {
      if (route.match(url)) {
        const status = route.status ?? 200;
        return {
          ok: status >= 200 && status < 300,
          status,
          async json() {
            return route.body;
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

function stubHappyPath() {
  vi.stubGlobal(
    "fetch",
    routeFetch([
      {
        match: (url) => /\/bill\/119\/hr(\?|$)/.test(url),
        body: fixture(BILLS_FIXTURES, "congress_bill_list_119_hr_2026-04-18.json"),
      },
      {
        match: (url) => url.includes("/committee-meeting/119?"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_list_119_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/house/116421"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116421_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/senate/116588"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116588_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/house/116600"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116600_2026-04-19.json",
        ),
      },
    ]),
  );
}

let db: ReturnType<typeof openMemoryDb>;

beforeEach(() => {
  db = withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
  vi.unstubAllGlobals();
});

describe("politiclaw_check_upcoming_votes tool", () => {
  it("renders new bills + events on first run with [new] markers", async () => {
    stubHappyPath();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "tax-policy", stance: "oppose", weight: 2 });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Bills — new or materially changed:");
    expect(text).toMatch(/\[new\] 119 HR/);
    expect(text).toContain("Upcoming committee events");
    expect(text).toContain("Financial Services Oversight Hearing");
    expect(text).toContain("informational, not independent journalism");
  });

  it("returns an empty-delta summary on a second invocation with unchanged data", async () => {
    stubHappyPath();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    await checkUpcomingVotesTool.execute!("call-1", { congress: 119, billType: "HR" }, undefined, undefined);

    stubHappyPath();
    const second = await checkUpcomingVotesTool.execute!(
      "call-2",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (second.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("No new or materially changed items");
    expect(text).not.toContain("[new]");
    expect(text).not.toContain("[changed]");
  });

  it("reports unavailable with actionable guidance when apiDataGov is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Check failed");
    expect(text).toContain("apiDataGov");
  });

  it("renders partial mode when only events fail and still emits unchanged counts on re-run", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => /\/bill\/119\/hr(\?|$)/.test(url),
          body: fixture(BILLS_FIXTURES, "congress_bill_list_119_hr_2026-04-18.json"),
        },
        {
          match: (url) => url.includes("/committee-meeting"),
          body: {},
          status: 503,
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toMatch(/\[new\] 119 HR/);
    expect(text).toContain("upcoming events:");
    expect(text).toContain("503");
  });
});
