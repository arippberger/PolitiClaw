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
import type { LlmClient } from "../domain/scoring/index.js";
import { scoreBillTool, setDirectionLlmForTests } from "./scoring.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "sources/bills/__fixtures__",
);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

type FetchEntry = { match: (url: string) => boolean; body: unknown };

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
          ok: true,
          status: 200,
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

function stubHousingFixtures() {
  vi.stubGlobal(
    "fetch",
    routeFetch([
      {
        match: (url) => /\/bill\/119\/hr\/1234($|\?)/.test(url),
        body: fixture("congress_bill_detail_119_hr_1234_2026-04-18.json"),
      },
      {
        match: (url) => url.includes("/bill/119/hr/1234/subjects"),
        body: fixture("congress_bill_subjects_119_hr_1234_2026-04-18.json"),
      },
      {
        match: (url) => url.includes("/bill/119/hr/1234/summaries"),
        body: fixture("congress_bill_summaries_119_hr_1234_2026-04-18.json"),
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
  setDirectionLlmForTests(null);
  vi.unstubAllGlobals();
});

describe("politiclaw_score_bill tool", () => {
  it("refuses to score when no stances are declared, with actionable guidance", async () => {
    stubHousingFixtures();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Cannot score");
    expect(text).toContain("politiclaw_issue_stances");
  });

  it("renders the disclaimer and named matches when stances are rich enough", async () => {
    stubHousingFixtures();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 2 });

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Bill 119 HR 1234");
    expect(text).toContain("housing");
    expect(text).toContain("Relevance to your stances");
    expect(text).toMatch(/Matches:\n {2}• housing/);
    expect(text).toContain("informational, not independent journalism");
    expect(text).not.toContain("insufficient data");
  });

  it("renders \"insufficient data\" when confidence is below the floor", async () => {
    stubHousingFixtures();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "defense", stance: "oppose", weight: 2 });

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("insufficient data");
    expect(text).toContain("informational, not independent journalism");
    expect(text).not.toContain("Relevance to your stances:");
  });

  it("surfaces unavailable when apiDataGov is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("unavailable");
    expect(text).toContain("apiDataGov");
  });

  it("appends a direction section when an LLM client is injected and alignment is above floor", async () => {
    stubHousingFixtures();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 2 });

    const fake: LlmClient = {
      async reason() {
        return {
          kind: "advances",
          confidence: 0.8,
          rationale: "bill funds affordable housing construction",
          quotedText: "Affordable housing",
          counterConsideration: "Some argue supply-side subsidies raise land prices.",
        };
      },
    };
    setDirectionLlmForTests(fake);

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Direction against your stances:");
    expect(text).toContain("appears to advance");
    expect(text).toContain("Counter-consideration:");
  });

  it("omits the direction section when no LLM client is wired", async () => {
    stubHousingFixtures();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });

    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).not.toContain("Direction against your stances:");
  });

  it("rejects a malformed billId with actionable feedback", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    const result = await scoreBillTool.execute!(
      "call-1",
      { billId: "bogus" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Could not parse");
  });
});
