import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCongressGovHouseVotesAdapter } from "./congressGov.js";

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

describe("congressGov house-votes adapter: list", () => {
  it("normalizes roll-call list responses and derives canonical ids + bill links", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.includes("/house-vote/119/1"),
        body: fixture("congress_house_vote_list_119_1_2026-04-19.json"),
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({ congress: 119, session: 1, limit: 10 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("congressGov.houseVotes");
    expect(result.tier).toBe(1);
    expect(result.data).toHaveLength(3);

    const first = result.data[0]!;
    expect(first.id).toBe("house-119-1-17");
    expect(first.chamber).toBe("House");
    expect(first.congress).toBe(119);
    expect(first.session).toBe(1);
    expect(first.rollCallNumber).toBe(17);
    expect(first.voteType).toBe("Yea-and-Nay");
    expect(first.result).toBe("Passed");
    expect(first.billId).toBe("119-hr-30");
    expect(first.amendmentId).toBeUndefined();
    expect(first.voteQuestion).toBeUndefined();
    expect(first.isProcedural).toBeUndefined();

    const amendment = result.data[2]!;
    expect(amendment.id).toBe("house-119-1-88");
    expect(amendment.billId).toBe("119-hr-1234");
    expect(amendment.amendmentId).toBe("119-hamdt-6");
    expect(amendment.amendmentAuthor).toContain("Tlaib");

    expect(calls[0]).toContain("api_key=k");
    expect(calls[0]).toContain("limit=10");
    expect(calls[0]).toContain("/house-vote/119/1");
  });

  it("omits the session segment when the caller only specifies congress", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.match(/\/house-vote\/119(\?|$)/) !== null,
        body: { houseRollCallVotes: [] },
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({ congress: 119 });

    expect(result.status).toBe("ok");
    expect(calls[0]).toContain("/house-vote/119");
    expect(calls[0]).not.toMatch(/\/house-vote\/119\/1/);
  });

  it("returns actionable unavailable when apiDataGov key is missing", async () => {
    const fetcher = vi.fn();
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "", fetcher });

    const result = await adapter.list({ congress: 119, session: 1 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("missing apiDataGov");
    expect(result.actionable).toContain("api.data.gov/signup");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns unavailable with quota hint on 429", async () => {
    const { fetcher } = routeFetch([
      {
        match: () => true,
        body: { error: { message: "rate limited" } },
        ok: false,
        status: 429,
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({ congress: 119, session: 1 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.actionable).toContain("quota");
  });

  it("propagates API-level error payloads as unavailable", async () => {
    const { fetcher } = routeFetch([
      {
        match: () => true,
        body: { error: { message: "beta endpoint disabled" } },
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({ congress: 119, session: 1 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("beta endpoint disabled");
  });
});

describe("congressGov house-votes adapter: getWithMembers", () => {
  it("fetches detail + members in parallel and hydrates voteQuestion + positions", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.includes("/house-vote/119/1/17/members"),
        body: fixture("congress_house_vote_members_119_1_17_2026-04-19.json"),
      },
      {
        match: (url) => url.includes("/house-vote/119/1/17"),
        body: fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 17,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const { vote, members } = result.data;
    expect(vote.id).toBe("house-119-1-17");
    expect(vote.voteQuestion).toBe("On Passage");
    expect(vote.isProcedural).toBe(false);
    expect(vote.billId).toBe("119-hr-30");

    expect(members).toHaveLength(5);
    expect(members.map((m) => m.bioguideId).sort()).toEqual([
      "A000055",
      "L000551",
      "P000197",
      "X000001",
      "Y000001",
    ]);
    const nancy = members.find((m) => m.bioguideId === "P000197")!;
    expect(nancy.position).toBe("Nay");
    expect(nancy.party).toBe("D");
    expect(nancy.state).toBe("CA");

    expect(calls.some((u) => u.includes("/house-vote/119/1/17") && !u.includes("/members"))).toBe(true);
    expect(calls.some((u) => u.includes("/house-vote/119/1/17/members"))).toBe(true);
  });

  it("flags procedural questions (On Motion to Recommit) with isProcedural=true", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/house-vote/119/1/42/members"),
        body: fixture("congress_house_vote_members_119_1_42_2026-04-19.json"),
      },
      {
        match: (url) => url.includes("/house-vote/119/1/42"),
        body: fixture("congress_house_vote_detail_119_1_42_2026-04-19.json"),
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 42,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.vote.voteQuestion).toBe("On Motion to Recommit");
    expect(result.data.vote.isProcedural).toBe(true);
  });

  it("returns the vote even when the members sub-resource fails", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/house-vote/119/1/17/members"),
        body: { error: { message: "service unavailable" } },
        ok: false,
        status: 503,
      },
      {
        match: (url) => url.includes("/house-vote/119/1/17"),
        body: fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 17,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.vote.voteQuestion).toBe("On Passage");
    expect(result.data.members).toEqual([]);
  });

  it("refuses Senate refs with a pointer at the scraper fallback", async () => {
    const fetcher = vi.fn();
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.getWithMembers({
      chamber: "Senate",
      congress: 119,
      session: 1,
      rollCallNumber: 1,
    });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("only serves House");
    expect(result.actionable).toContain("unitedstates/congress scraper");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("skips member rows with unknown voteCast strings", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/members"),
        body: fixture("congress_house_vote_members_119_1_17_2026-04-19.json"),
      },
      {
        match: (url) => url.includes("/house-vote/119/1/17"),
        body: fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
      },
    ]);
    const adapter = createCongressGovHouseVotesAdapter({ apiKey: "k", fetcher });

    const result = await adapter.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 17,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const ignored = result.data.members.find((m) => m.bioguideId === "Z000001");
    expect(ignored).toBeUndefined();
  });
});
