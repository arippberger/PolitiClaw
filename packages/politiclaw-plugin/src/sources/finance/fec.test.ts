import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { createFecAdapter } from "./fec.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}

function adapter(fetcher: typeof fetch) {
  return createFecAdapter({
    apiKey: "TESTKEY",
    fetcher,
    baseUrl: "https://fec.test/v1",
    now: () => 1_700_000_000_000,
  });
}

describe("FEC adapter — searchCandidates", () => {
  it("normalizes a fuzzy search result into adapter-agnostic refs", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      expect(url).toContain("/candidates/search/");
      expect(url).toContain("q=Example");
      expect(url).toContain("api_key=TESTKEY");
      return jsonResponse(readFixture("fec_candidate_search.json"));
    };

    const result = await adapter(fetcher).searchCandidates({ nameQuery: "Example" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tier).toBe(1);
    expect(result.data).toHaveLength(1);
    const [first] = result.data;
    expect(first?.candidateId).toBe("H0EX01234");
    expect(first?.office).toBe("H");
    expect(first?.state).toBe("CA");
    expect(first?.district).toBe("12");
    expect(first?.party).toBe("DEMOCRATIC PARTY");
    expect(first?.incumbentChallengeStatus).toBe("Incumbent");
    expect(calls).toHaveLength(1);
  });

  it("rejects when both query and race coordinates are missing", async () => {
    const fetcher = (async () => {
      throw new Error("should not be called");
    }) as unknown as typeof fetch;
    const result = await adapter(fetcher).searchCandidates({ nameQuery: "   " });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("no race coordinates");
    expect(result.actionable).toContain("office + state");
  });

  it("accepts coordinate-only filters and routes through /candidates/", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      expect(url).toContain("/candidates/");
      expect(url).not.toContain("/candidates/search/");
      expect(url).toContain("office=H");
      expect(url).toContain("state=CA");
      expect(url).toContain("district=12");
      expect(url).toContain("cycle=2026");
      expect(url).not.toContain("q=");
      return jsonResponse(readFixture("fec_candidate_search.json"));
    };
    const result = await adapter(fetcher).searchCandidates({
      office: "H",
      state: "CA",
      district: "12",
      cycle: 2026,
    });
    expect(result.status).toBe("ok");
    expect(calls).toHaveLength(1);
  });

  it("propagates HTTP errors with FEC's message surfaced", async () => {
    const fetcher = (async () =>
      new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    const result = await adapter(fetcher).searchCandidates({ nameQuery: "Example" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("API rate limit exceeded");
    expect(result.reason).toContain("429");
  });

  it("returns an empty array for no hits without erroring", async () => {
    const fetcher = (async () =>
      jsonResponse(readFixture("fec_candidate_search_empty.json"))) as unknown as typeof fetch;
    const result = await adapter(fetcher).searchCandidates({ nameQuery: "Zzz" });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual([]);
  });
});

describe("FEC adapter — getCandidateSummary", () => {
  it("merges candidate ref with per-cycle totals and preserves null columns", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/candidate/H0EX01234/totals/")) {
        return jsonResponse(readFixture("fec_candidate_totals.json"));
      }
      if (url.includes("/candidate/H0EX01234/")) {
        return jsonResponse(readFixture("fec_candidate_search.json"));
      }
      throw new Error(`unexpected url ${url}`);
    };

    const result = await adapter(fetcher).getCandidateSummary("H0EX01234");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.candidate.candidateId).toBe("H0EX01234");
    expect(result.data.totals).toHaveLength(2);
    const [recent, prior] = result.data.totals;
    expect(recent?.cycle).toBe(2024);
    expect(recent?.receipts).toBe(1234567.89);
    expect(recent?.pacContributions).toBe(200000);
    expect(recent?.coverageEndDate).toBe("2024-12-31");
    expect(prior?.candidateSelfFunding).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it("returns unavailable when the candidate id is unknown", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/totals/")) {
        return jsonResponse(readFixture("fec_candidate_search_empty.json"));
      }
      return jsonResponse(readFixture("fec_candidate_search_empty.json"));
    };
    const result = await adapter(fetcher).getCandidateSummary("XX0000");
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("no FEC candidate found");
    expect(result.actionable).toContain("politiclaw_research_finance");
  });

  it("degrades gracefully when totals endpoint fails", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/totals/")) {
        return new Response("boom", { status: 500 });
      }
      return jsonResponse(readFixture("fec_candidate_search.json"));
    };
    const result = await adapter(fetcher).getCandidateSummary("H0EX01234");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.candidate.candidateId).toBe("H0EX01234");
    expect(result.data.totals).toEqual([]);
  });
});

describe("FEC adapter — getCandidateTotals (cycle-filtered)", () => {
  it("forwards the cycle param to the totals endpoint", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);
      expect(url).toContain("/candidate/H0EX01234/totals/");
      expect(url).toContain("cycle=2024");
      return jsonResponse(readFixture("fec_candidate_totals.json"));
    };
    const result = await adapter(fetcher).getCandidateTotals("H0EX01234", 2024);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(2);
    expect(calls).toHaveLength(1);
  });

  it("returns empty when no totals rows come back", async () => {
    const fetcher = (async () =>
      jsonResponse(readFixture("fec_candidate_search_empty.json"))) as unknown as typeof fetch;
    const result = await adapter(fetcher).getCandidateTotals("H0EX01234", 2026);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toEqual([]);
  });
});
