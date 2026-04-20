import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "../../storage/sqlite.js";
import { createHouseVotesResolver } from "../../sources/votes/index.js";
import {
  ingestHouseVotes,
  listMemberVotes,
  listStoredVotes,
} from "./ingest.js";

const FIXTURES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "sources",
  "votes",
  "__fixtures__",
);

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

type Route = {
  match: (url: string) => boolean;
  body: unknown;
  ok?: boolean;
  status?: number;
};

function routeFetch(routes: Route[]) {
  const calls: string[] = [];
  const fetcher = vi.fn(async (input: URL | string | Request) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url;
    calls.push(url);
    for (const route of routes) {
      if (route.match(url)) {
        return jsonResponse(route.body, { ok: route.ok, status: route.status });
      }
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  return { fetcher, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ingestHouseVotes", () => {
  it("persists vote + member rows on a first run", async () => {
    const db = openMemoryDb();
    const { fetcher } = routeFetch([
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
        body: { error: { message: "detail unavailable" } },
        ok: false,
        status: 503,
      },
    ]);
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1, limit: 10 },
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.source).toEqual({ adapterId: "congressGov.houseVotes", tier: 1 });
    expect(result.ingested).toHaveLength(3);

    const byId = new Map(result.ingested.map((i) => [i.id, i]));
    expect(byId.get("house-119-1-17")!.status).toBe("new");
    expect(byId.get("house-119-1-17")!.memberCount).toBe(5);
    expect(byId.get("house-119-1-42")!.status).toBe("new");
    expect(byId.get("house-119-1-42")!.memberCount).toBe(2);
    expect(byId.get("house-119-1-88")!.status).toBe("skipped_unavailable");
    expect(byId.get("house-119-1-88")!.reason).toContain("http");

    const stored = listStoredVotes(db);
    expect(stored).toHaveLength(2);
    const vote17 = stored.find((v) => v.id === "house-119-1-17")!;
    expect(vote17.billId).toBe("119-hr-30");
    expect(vote17.voteQuestion).toBe("On Passage");
    expect(vote17.isProcedural).toBe(false);
    expect(vote17.sourceTier).toBe(1);
    expect(vote17.sourceAdapterId).toBe("congressGov.houseVotes");

    const vote42 = stored.find((v) => v.id === "house-119-1-42")!;
    expect(vote42.voteQuestion).toBe("On Motion to Recommit");
    expect(vote42.isProcedural).toBe(true);

    const members17 = listMemberVotes(db, "house-119-1-17");
    expect(members17).toHaveLength(5);
    expect(members17.find((m) => m.bioguideId === "P000197")!.position).toBe("Nay");
  });

  it("is idempotent — a second run with unchanged update_date skips detail fetches", async () => {
    const db = openMemoryDb();

    const listBody = {
      houseRollCallVotes: [
        {
          congress: 119,
          sessionNumber: 1,
          rollCallNumber: 17,
          identifier: 1191202517,
          startDate: "2025-01-16T11:00:00-05:00",
          updateDate: "2025-04-18T08:44:47-04:00",
          voteType: "Yea-and-Nay",
          result: "Passed",
          legislationType: "HR",
          legislationNumber: "30",
        },
      ],
    };

    let detailCalls = 0;
    const fetcher = vi.fn(async (input: URL | string | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes("/house-vote/119/1/17/members")) {
        detailCalls += 1;
        return jsonResponse(
          fixture("congress_house_vote_members_119_1_17_2026-04-19.json"),
        );
      }
      if (url.includes("/house-vote/119/1/17")) {
        detailCalls += 1;
        return jsonResponse(
          fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
        );
      }
      return jsonResponse(listBody);
    });

    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const first = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.ingested[0]!.status).toBe("new");

    const detailCallsAfterFirst = detailCalls;
    expect(detailCallsAfterFirst).toBe(2);

    const second = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.ingested[0]!.status).toBe("unchanged");
    expect(second.ingested[0]!.memberCount).toBe(5);

    expect(detailCalls).toBe(detailCallsAfterFirst);
  });

  it("re-fetches when update_date advances", async () => {
    const db = openMemoryDb();
    let update = "2025-04-18T08:44:47-04:00";
    const fetcher = vi.fn(async (input: URL | string | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url.includes("/house-vote/119/1/17/members")) {
        return jsonResponse(
          fixture("congress_house_vote_members_119_1_17_2026-04-19.json"),
        );
      }
      if (url.includes("/house-vote/119/1/17")) {
        return jsonResponse(
          fixture("congress_house_vote_detail_119_1_17_2026-04-19.json"),
        );
      }
      return jsonResponse({
        houseRollCallVotes: [
          {
            congress: 119,
            sessionNumber: 1,
            rollCallNumber: 17,
            updateDate: update,
            voteType: "Yea-and-Nay",
            result: "Passed",
            legislationType: "HR",
            legislationNumber: "30",
          },
        ],
      });
    });
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const first = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });
    if (first.status !== "ok") throw new Error("expected ok");
    expect(first.ingested[0]!.status).toBe("new");

    update = "2025-05-01T00:00:00Z";
    const second = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });
    if (second.status !== "ok") throw new Error("expected ok");
    expect(second.ingested[0]!.status).toBe("updated");
  });

  it("returns unavailable when the list endpoint fails", async () => {
    const db = openMemoryDb();
    const { fetcher } = routeFetch([
      {
        match: () => true,
        body: { error: { message: "service down" } },
        ok: false,
        status: 503,
      },
    ]);
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("congressGov.houseVotes");
  });

  it("filters stored votes by bioguide and excludes procedural on request", async () => {
    const db = openMemoryDb();
    const { fetcher } = routeFetch([
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
    ]);
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });
    await ingestHouseVotes(db, resolver, {
      filters: { congress: 119, session: 1 },
    });

    const all = listStoredVotes(db);
    expect(all).toHaveLength(2);

    const aderholt = listStoredVotes(db, { bioguideId: "A000055" });
    expect(aderholt).toHaveLength(2);

    const nancy = listStoredVotes(db, { bioguideId: "P000197" });
    expect(nancy.map((v) => v.id)).toEqual(["house-119-1-17"]);

    const substantive = listStoredVotes(db, {
      bioguideId: "A000055",
      excludeProcedural: true,
    });
    expect(substantive.map((v) => v.id)).toEqual(["house-119-1-17"]);
  });
});
