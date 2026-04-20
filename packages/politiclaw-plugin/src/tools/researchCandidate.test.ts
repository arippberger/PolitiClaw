import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kv } from "../storage/kv.js";
import { openMemoryDb } from "../storage/sqlite.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import type { BioPayload } from "../sources/webSearch/index.js";
import {
  renderCandidateBio,
  renderCandidateSummary,
  renderSearchMatches,
  researchCandidateTool,
  setWebSearchResolverForTests,
} from "./researchCandidate.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "../sources/finance/__fixtures__");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function makeFetchResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    async json() {
      return body;
    },
  } as unknown as Response;
}

describe("renderCandidateSummary", () => {
  it("formats per-cycle totals with USD labels and omits no-data rows gracefully", () => {
    const text = renderCandidateSummary(
      {
        candidate: {
          candidateId: "H0EX01234",
          name: "EXAMPLE, ALEX",
          party: "Democratic",
          office: "H",
          state: "CA",
          district: "12",
          incumbentChallengeStatus: "Incumbent",
        },
        totals: [
          {
            candidateId: "H0EX01234",
            cycle: 2024,
            receipts: 1_234_567.89,
            disbursements: 987_654.32,
            cashOnHandEndPeriod: 246_913.57,
            individualContributions: 900_000,
            pacContributions: 200_000,
            candidateSelfFunding: null,
            independentExpendituresInSupport: null,
            independentExpendituresInOpposition: null,
            coverageEndDate: "2024-12-31",
          },
        ],
      },
      { adapterId: "fec", tier: 1 },
    );
    expect(text).toContain("tier 1");
    expect(text).toContain("EXAMPLE, ALEX");
    expect(text).toContain("district 12");
    expect(text).toContain("$1,234,568");
    expect(text).toContain("candidate self-funding: no data");
    expect(text).toContain("informational, not independent journalism");
  });

  it("explains the gap when FEC returned no totals rows", () => {
    const text = renderCandidateSummary(
      {
        candidate: {
          candidateId: "S0XX99999",
          name: "NEW, CANDIDATE",
          office: "S",
          state: "CO",
        },
        totals: [],
      },
      { adapterId: "fec", tier: 1 },
    );
    expect(text).toContain("No FEC financial totals");
    expect(text).toContain("OpenSecrets");
  });
});

describe("renderSearchMatches", () => {
  it("caps output at 5 and points users back to the candidateId path", () => {
    const bulk = Array.from({ length: 7 }, (_, index) => ({
      candidateId: `H0EX0${index}0`,
      name: `EXAMPLE ${index}`,
      office: "H" as const,
      state: "CA",
    }));
    const text = renderSearchMatches(bulk, "Example", { adapterId: "fec", tier: 1 });
    expect(text.match(/EXAMPLE \d/g)).toHaveLength(5);
    expect(text).toContain("2 more");
    expect(text).toContain("candidateId");
  });

  it("reports a helpful hint on zero matches", () => {
    const text = renderSearchMatches([], "Zzz", { adapterId: "fec", tier: 1 });
    expect(text).toContain("No FEC candidates matched");
  });
});

describe("politiclaw_research_candidate tool", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    configureStorage(() => "/tmp/politiclaw-research-tests");
    setStorageForTests({ db, kv: new Kv(db) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setWebSearchResolverForTests(null);
    resetStorageConfigForTests();
  });

  it("requires apiDataGov and surfaces the specific config path", async () => {
    setPluginConfigForTests({ apiKeys: {} });
    const result = await researchCandidateTool.execute!(
      "t1",
      { candidateId: "H0EX01234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("api.data.gov");
    expect(text).toContain("apiDataGov");
  });

  it("rejects empty input with an actionable error", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });
    const result = await researchCandidateTool.execute!("t2", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Pass either `candidateId` or `name`");
  });

  it("routes candidateId through the FEC adapter and renders totals", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/totals/")) {
        return makeFetchResponse(readFixture("fec_candidate_totals.json"));
      }
      if (url.includes("/candidate/H0EX01234/")) {
        return makeFetchResponse(readFixture("fec_candidate_search.json"));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });

    const result = await researchCandidateTool.execute!(
      "t3",
      { candidateId: "H0EX01234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Cycle 2024");
    expect(text).toContain("$1,234,568");
    expect(text).toContain("FEC H0EX01234");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("routes name queries through searchCandidates and caps to 5 entries", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      expect(url).toContain("/candidates/search/");
      expect(url).toContain("q=Example");
      return makeFetchResponse(readFixture("fec_candidate_search.json"));
    });
    vi.stubGlobal("fetch", fetcher);
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });

    const result = await researchCandidateTool.execute!(
      "t4",
      { name: "Example", state: "ca" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("FEC candidate search");
    expect(text).toContain("EXAMPLE, ALEX");
  });
});

describe("renderCandidateBio", () => {
  it("renders narrative, structured fields, and citations with the tier tag", () => {
    const lines = renderCandidateBio("EXAMPLE, ALEX", {
      status: "ok",
      adapterId: "webSearch.bios",
      tier: 2,
      data: {
        category: "candidate.bio",
        narrativeText: "Prior state legislator, elected to U.S. House in 2018.",
        structured: { priorOffice: "California State Senate, 13th district" },
        citations: [
          {
            url: "https://ballotpedia.org/Example_Candidate",
            title: "Example Candidate — Ballotpedia",
            retrievedAt: 1700000000,
          },
        ],
      },
      fetchedAt: 1,
    });
    const text = lines.join("\n");
    expect(text).toContain("Bio for EXAMPLE, ALEX — tier 2 (webSearch.bios)");
    expect(text).toContain("Prior state legislator");
    expect(text).toContain("priorOffice: California State Senate, 13th district");
    expect(text).toContain(
      "Example Candidate — Ballotpedia — https://ballotpedia.org/Example_Candidate",
    );
  });

  it("surfaces an actionable unavailable line when the transport is not wired", () => {
    const lines = renderCandidateBio("EXAMPLE, ALEX", {
      status: "unavailable",
      adapterId: "webSearch.bios",
      reason: "candidate-bio adapter has no live web-search transport wired yet",
      actionable: "Inject a WebSearchFetcher in tests to exercise the full path.",
    });
    const text = lines.join("\n");
    expect(text).toContain("Bio for EXAMPLE, ALEX: unavailable");
    expect(text).toContain("no live web-search transport");
    expect(text).toContain("Inject a WebSearchFetcher");
  });
});

describe("renderCandidateSummary with bio attached", () => {
  const baseSummary = {
    candidate: {
      candidateId: "H0EX01234",
      name: "EXAMPLE, ALEX",
      office: "H" as const,
      state: "CA",
      district: "12",
    },
    totals: [],
  };

  it("renders bio + verify disclaimer when bioResult is ok", () => {
    const bioResult = {
      status: "ok" as const,
      adapterId: "webSearch.bios",
      tier: 1 as const,
      data: {
        category: "candidate.bio" as const,
        narrativeText: "Career facts from official sources.",
        citations: [
          { url: "https://house.gov/example", retrievedAt: 1 },
        ],
      },
      fetchedAt: 100,
    };
    const text = renderCandidateSummary(
      baseSummary,
      { adapterId: "fec", tier: 1 },
      bioResult,
    );
    expect(text).toContain("Bio for EXAMPLE, ALEX — tier 1 (webSearch.bios)");
    expect(text).toContain("Career facts from official sources.");
    expect(text).toContain("LLM-search-derived and paraphrases the cited sources");
    expect(text).not.toContain(
      "Bio, voting record, and position statements are not in this output",
    );
  });

  it("drops the verify disclaimer when bio is unavailable but still names the gap", () => {
    const text = renderCandidateSummary(
      baseSummary,
      { adapterId: "fec", tier: 1 },
      {
        status: "unavailable",
        adapterId: "webSearch.bios",
        reason: "candidate-bio adapter has no live web-search transport wired yet",
      },
    );
    expect(text).toContain("Bio for EXAMPLE, ALEX: unavailable");
    expect(text).not.toContain("LLM-search-derived and paraphrases the cited sources");
  });

  it("falls back to the original no-bio message when bioResult is omitted", () => {
    const text = renderCandidateSummary(baseSummary, { adapterId: "fec", tier: 1 });
    expect(text).toContain(
      "Bio, voting record, and position statements are not in this output",
    );
    expect(text).not.toContain("Bio for EXAMPLE, ALEX");
  });
});

describe("politiclaw_research_candidate bio wiring", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    configureStorage(() => "/tmp/politiclaw-research-bio-tests");
    setStorageForTests({ db, kv: new Kv(db) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setWebSearchResolverForTests(null);
    resetStorageConfigForTests();
  });

  it("attaches an injected bio with tier promotion on the candidateId path", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/totals/")) {
        return makeFetchResponse(readFixture("fec_candidate_totals.json"));
      }
      if (url.includes("/candidate/H0EX01234/")) {
        return makeFetchResponse(readFixture("fec_candidate_search.json"));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });
    const bioPayload: BioPayload = {
      category: "candidate.bio",
      narrativeText: "Two-term member, prior state senate service.",
      citations: [{ url: "https://house.gov/example", retrievedAt: 111 }],
    };
    setWebSearchResolverForTests({
      async bio(query) {
        expect(query.category).toBe("candidate.bio");
        expect(query.office).toBe("H");
        expect(query.state).toBe("CA");
        expect(query.district).toBe("12");
        return {
          status: "ok",
          adapterId: "webSearch.bios",
          tier: 1,
          data: bioPayload,
          fetchedAt: 111,
        };
      },
    });

    const result = await researchCandidateTool.execute!(
      "t-bio-ok",
      { candidateId: "H0EX01234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Bio for EXAMPLE, ALEX — tier 1 (webSearch.bios)");
    expect(text).toContain("Two-term member, prior state senate service.");
    expect(text).toContain("LLM-search-derived and paraphrases the cited sources");
  });

  it("degrades to an unavailable bio line when no transport is wired", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/totals/")) {
        return makeFetchResponse(readFixture("fec_candidate_totals.json"));
      }
      if (url.includes("/candidate/H0EX01234/")) {
        return makeFetchResponse(readFixture("fec_candidate_search.json"));
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });

    const result = await researchCandidateTool.execute!(
      "t-bio-unavailable",
      { candidateId: "H0EX01234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Bio for EXAMPLE, ALEX: unavailable");
    expect(text).toContain("no live web-search transport");
    expect(text).not.toContain("LLM-search-derived and paraphrases the cited sources");
  });

  it("does not attempt a bio on the name-search path", async () => {
    const fetcher = vi.fn(async () =>
      makeFetchResponse(readFixture("fec_candidate_search.json")),
    );
    vi.stubGlobal("fetch", fetcher);
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });
    const bioSpy = vi.fn();
    setWebSearchResolverForTests({
      async bio(query) {
        bioSpy(query);
        return {
          status: "ok",
          adapterId: "webSearch.bios",
          tier: 5,
          data: {
            category: "candidate.bio",
            narrativeText: "should not be called",
            citations: [],
          },
          fetchedAt: 1,
        };
      },
    });

    await researchCandidateTool.execute!(
      "t-bio-search",
      { name: "Example", state: "ca" },
      undefined,
      undefined,
    );
    expect(bioSpy).not.toHaveBeenCalled();
  });
});
