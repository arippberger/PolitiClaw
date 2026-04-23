import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseVoteviewBillNumber } from "./billNumberParser.js";
import { isSenateProceduralQuestion } from "./senateProcedural.js";
import {
  createVoteviewSenateVotesAdapter,
  sessionFromDate,
} from "./voteview.js";
import { createVoteviewClient } from "./voteviewClient.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES_DIR, name), "utf8"));
}

function jsonResponse(body: unknown, { ok = true, status = 200 } = {}): Response {
  return {
    ok,
    status,
    async json() {
      return body;
    },
  } as unknown as Response;
}

type FetchEntry = {
  match: (url: string) => boolean;
  body: unknown;
  ok?: boolean;
  status?: number;
};

function routeFetch(entries: FetchEntry[]) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: URL | string | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    calls.push(url);
    for (const entry of entries) {
      if (entry.match(url)) {
        return jsonResponse(entry.body, { ok: entry.ok, status: entry.status });
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return { fetcher, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("parseVoteviewBillNumber", () => {
  it("normalizes bare bill types into canonical ids", () => {
    expect(parseVoteviewBillNumber(119, "S5")).toBe("119-s-5");
    expect(parseVoteviewBillNumber(119, "HR1234")).toBe("119-hr-1234");
    expect(parseVoteviewBillNumber(119, "HRES 23")).toBe("119-hres-23");
    expect(parseVoteviewBillNumber(119, "SJRES60")).toBe("119-sjres-60");
    expect(parseVoteviewBillNumber(119, "HCONRES 7")).toBe("119-hconres-7");
  });

  it("strips punctuation and whitespace before matching", () => {
    expect(parseVoteviewBillNumber(119, "H.R. 1234")).toBe("119-hr-1234");
    expect(parseVoteviewBillNumber(119, "S.J.Res. 55")).toBe("119-sjres-55");
    expect(parseVoteviewBillNumber(119, "H.CON.RES. 7")).toBe("119-hconres-7");
  });

  it("rejects presidential-nomination identifiers", () => {
    expect(parseVoteviewBillNumber(119, "PN1113")).toBeUndefined();
    expect(parseVoteviewBillNumber(119, "PN11-22")).toBeUndefined();
  });

  it("returns undefined for unknown types, empty strings, and null", () => {
    expect(parseVoteviewBillNumber(119, "XYZ42")).toBeUndefined();
    expect(parseVoteviewBillNumber(119, "")).toBeUndefined();
    expect(parseVoteviewBillNumber(119, null)).toBeUndefined();
    expect(parseVoteviewBillNumber(119, undefined)).toBeUndefined();
  });
});

describe("isSenateProceduralQuestion", () => {
  it("flags cloture, motion-to-proceed, tabling, and discharge as procedural", () => {
    expect(isSenateProceduralQuestion("On the Cloture Motion")).toBe(true);
    expect(isSenateProceduralQuestion("On Cloture on the Motion to Proceed")).toBe(true);
    expect(isSenateProceduralQuestion("On the Motion to Proceed")).toBe(true);
    expect(isSenateProceduralQuestion("On the Motion to Table")).toBe(true);
    expect(isSenateProceduralQuestion("On the Motion to Discharge")).toBe(true);
  });

  it("treats nominations and passage as substantive", () => {
    expect(isSenateProceduralQuestion("On the Nomination")).toBe(false);
    expect(isSenateProceduralQuestion("On Passage of the Bill")).toBe(false);
    expect(isSenateProceduralQuestion("On the Joint Resolution")).toBe(false);
  });

  it("matches case-insensitively and returns false for undefined", () => {
    expect(isSenateProceduralQuestion("on the cloture motion")).toBe(true);
    expect(isSenateProceduralQuestion(undefined)).toBe(false);
  });
});

describe("sessionFromDate", () => {
  it("derives session 1 for the Congress start year", () => {
    expect(sessionFromDate(119, "2025-01-09")).toBe(1);
    expect(sessionFromDate(119, "2025-12-31")).toBe(1);
    expect(sessionFromDate(118, "2023-03-15")).toBe(1);
  });

  it("derives session 2 for the second calendar year", () => {
    expect(sessionFromDate(119, "2026-01-07")).toBe(2);
    expect(sessionFromDate(119, "2026-12-31")).toBe(2);
    expect(sessionFromDate(118, "2024-06-01")).toBe(2);
  });

  it("returns null for dates outside the Congress span or unparseable input", () => {
    expect(sessionFromDate(119, "2024-12-31")).toBeNull();
    expect(sessionFromDate(119, "2027-01-01")).toBeNull();
    expect(sessionFromDate(119, "not-a-date")).toBeNull();
  });
});

describe("voteviewClient", () => {
  it("retries on 429 up to the configured retry count, then surfaces unavailable", async () => {
    const { fetcher } = routeFetch([
      { match: () => true, body: {}, ok: false, status: 429 },
    ]);
    const client = createVoteviewClient({
      fetcher,
      retries: 2,
      backoffBaseMs: 0,
      sleep: async () => {},
      random: () => 0,
    });

    const result = await client.searchRollcalls("congress:119 chamber:Senate");

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.reason).toContain("http 429");
    // Initial attempt + 2 retries = 3 total fetcher calls.
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not retry on 4xx other than 429", async () => {
    const { fetcher } = routeFetch([
      { match: () => true, body: {}, ok: false, status: 404 },
    ]);
    const client = createVoteviewClient({
      fetcher,
      retries: 2,
      backoffBaseMs: 0,
      sleep: async () => {},
    });

    await client.searchRollcalls("x");

    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("maps errormessage payloads from /api/download to a typed error", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/api/download"),
        body: {
          errormessage: "Invalid Rollcall ID specified.",
          errormeta: ["RS1190588"],
          apitype: "Web 2016-10",
        },
      },
    ]);
    const client = createVoteviewClient({ fetcher, retries: 0 });

    const result = await client.getRollcall("RS1190588");

    expect(result.kind).toBe("error");
    if (result.kind !== "error") return;
    expect(result.reason).toContain("Invalid Rollcall ID");
  });
});

describe("createVoteviewSenateVotesAdapter", () => {
  function adapter(fetcher: typeof fetch) {
    return createVoteviewSenateVotesAdapter({
      fetcher,
      retries: 0,
      backoffBaseMs: 0,
      sleep: async () => {},
    });
  }

  it("refuses non-Senate refs with a pointer at the House adapter", async () => {
    const fetcher = vi.fn();
    const a = adapter(fetcher);

    const listResult = await a.list({ chamber: "House", congress: 119 });
    const detailResult = await a.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 1,
    });

    expect(listResult.status).toBe("unavailable");
    if (listResult.status !== "unavailable") return;
    expect(listResult.reason).toContain("only serves Senate");
    expect(listResult.actionable).toContain("congressGov");

    expect(detailResult.status).toBe("unavailable");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("list normalizes Voteview search rows into RollCallVote", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.includes("/api/search"),
        body: fixture("voteview_search_119_senate_2026-04-22.json"),
      },
    ]);
    const a = adapter(fetcher);

    const result = await a.list({ chamber: "Senate", congress: 119, limit: 10 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("voteview.senateVotes");
    expect(result.tier).toBe(2);
    expect(result.data).toHaveLength(5);

    const byId = new Map(result.data.map((v) => [v.id, v]));

    const cloture = byId.get("senate-119-1-1")!;
    expect(cloture.chamber).toBe("Senate");
    expect(cloture.rollCallNumber).toBe(1);
    expect(cloture.session).toBe(1);
    expect(cloture.startDate).toBe("2025-01-09");
    expect(cloture.billId).toBe("119-s-5");
    expect(cloture.voteQuestion).toBe("On the Cloture Motion");
    expect(cloture.isProcedural).toBe(true);
    expect(cloture.sourceUrl).toContain("voteview.com/rollcall/RS1190001");
    expect(cloture.legislationUrl).toContain("congress.gov/bill/119/senate-bill/5");

    const passage = byId.get("senate-119-1-7")!;
    expect(passage.voteQuestion).toBe("On Passage of the Bill");
    expect(passage.isProcedural).toBe(false);

    const nomination = byId.get("senate-119-1-8")!;
    expect(nomination.voteQuestion).toBe("On the Nomination");
    expect(nomination.isProcedural).toBe(false);
    expect(nomination.billId).toBeUndefined(); // PN* rejected by parser

    const mtp2026 = byId.get("senate-119-2-663")!;
    expect(mtp2026.session).toBe(2);
    expect(mtp2026.startDate).toBe("2026-01-07");
    expect(mtp2026.billId).toBe("119-sjres-86");

    // Sorted by recency (newest first) — 2026 MTP should come first.
    expect(result.data[0]!.id).toBe("senate-119-2-663");

    expect(calls[0]).toContain("/api/search");
    expect(calls[0]).toContain("chamber%3ASenate");
  });

  it("list applies the session filter using derived sessions", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/api/search"),
        body: fixture("voteview_search_119_senate_2026-04-22.json"),
      },
    ]);
    const a = adapter(fetcher);

    const s1 = await a.list({ chamber: "Senate", congress: 119, session: 1, limit: 50 });
    expect(s1.status).toBe("ok");
    if (s1.status !== "ok") return;
    expect(s1.data.every((v) => v.session === 1)).toBe(true);
    expect(s1.data).toHaveLength(4);

    const s2 = await a.list({ chamber: "Senate", congress: 119, session: 2, limit: 50 });
    expect(s2.status).toBe("ok");
    if (s2.status !== "ok") return;
    expect(s2.data.every((v) => v.session === 2)).toBe(true);
    expect(s2.data).toHaveLength(1);
  });

  it("getWithMembers hydrates per-member positions keyed by bioguide", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.includes("rollcall_id=RS1190001"),
        body: fixture("voteview_download_RS1190001_2026-04-22.json"),
      },
    ]);
    const a = adapter(fetcher);

    const result = await a.getWithMembers({
      chamber: "Senate",
      congress: 119,
      session: 1,
      rollCallNumber: 1,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const { vote, members } = result.data;

    expect(vote.id).toBe("senate-119-1-1");
    expect(vote.voteQuestion).toBe("On the Cloture Motion");
    expect(vote.isProcedural).toBe(true);
    expect(vote.billId).toBe("119-s-5");

    // Fixture trimmed to 2 Yea + 2 Nay + (cloture had no Not Voting row kept).
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) {
      expect(m.voteId).toBe("senate-119-1-1");
      expect(m.bioguideId).toMatch(/^[A-Z]\d{6}$/);
      expect(["Yea", "Nay", "Present", "Not Voting"]).toContain(m.position);
    }
    expect(calls[0]).toContain("/api/download");
    expect(calls[0]).toContain("rollcall_id=RS1190001");
  });

  it("getWithMembers surfaces the errormessage payload as skipped_unavailable", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/api/download"),
        body: {
          errormessage: "Invalid Rollcall ID specified.",
          errormeta: ["RS1190588"],
          apitype: "Web 2016-10",
        },
      },
    ]);
    const a = adapter(fetcher);

    const result = await a.getWithMembers({
      chamber: "Senate",
      congress: 119,
      session: 1,
      rollCallNumber: 588,
    });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("Invalid Rollcall ID");
  });
});
