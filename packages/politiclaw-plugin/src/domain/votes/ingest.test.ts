import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { openMemoryDb } from "../../storage/sqlite.js";
import { createVotesResolver } from "../../sources/votes/index.js";
import {
  ingestVotes,
  listMemberVotes,
  listRecentBillVotes,
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

describe("ingestVotes (House)", () => {
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
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1, limit: 10 },
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

    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const first = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.ingested[0]!.status).toBe("new");

    const detailCallsAfterFirst = detailCalls;
    expect(detailCallsAfterFirst).toBe(2);

    const second = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
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
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const first = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
    });
    if (first.status !== "ok") throw new Error("expected ok");
    expect(first.ingested[0]!.status).toBe("new");

    update = "2025-05-01T00:00:00Z";
    const second = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
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
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
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
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });
    await ingestVotes(db, resolver, {
      filters: { chamber: "House", congress: 119, session: 1 },
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

describe("ingestVotes (Senate)", () => {
  it("is idempotent when updateDate is absent and members are already stored", async () => {
    const db = openMemoryDb();

    let detailCalls = 0;
    const fetcher = vi.fn(async (input: URL | string | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;

      if (url.includes("/api/search")) {
        return jsonResponse(fixture("voteview_search_119_senate_2026-04-22.json"));
      }
      if (url.includes("/api/download")) {
        detailCalls += 1;
        if (url.includes("rollcall_id=RS1190001")) {
          return jsonResponse(fixture("voteview_download_RS1190001_2026-04-22.json"));
        }
        if (url.includes("rollcall_id=RS1190003")) {
          return jsonResponse(fixture("voteview_download_RS1190003_2026-04-22.json"));
        }
        if (url.includes("rollcall_id=RS1190007")) {
          return jsonResponse(fixture("voteview_download_RS1190007_2026-04-22.json"));
        }
        if (url.includes("rollcall_id=RS1190008")) {
          return jsonResponse(fixture("voteview_download_RS1190008_2026-04-22.json"));
        }
        if (url.includes("rollcall_id=RS1190663")) {
          return jsonResponse(fixture("voteview_download_RS1190663_2026-04-22.json"));
        }
      }
      throw new Error(`unexpected fetch: ${url}`);
    });

    const resolver = createVotesResolver({ fetcher });

    const first = await ingestVotes(db, resolver, {
      filters: { chamber: "Senate", congress: 119, limit: 20 },
    });
    expect(first.status).toBe("ok");
    if (first.status !== "ok") return;
    expect(first.ingested.every((v) => v.status === "new")).toBe(true);
    expect(detailCalls).toBe(5);

    const second = await ingestVotes(db, resolver, {
      filters: { chamber: "Senate", congress: 119, limit: 20 },
    });
    expect(second.status).toBe("ok");
    if (second.status !== "ok") return;
    expect(second.ingested.every((v) => v.status === "unchanged")).toBe(true);
    expect(detailCalls).toBe(5);
  });
});

describe("listRecentBillVotes", () => {
  it("joins bill titles and excludes votes with no bill", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-10', 119, 'HR', '10', 'Bill Ten',
               1700000000000, 'congressGov', 1)`,
    ).run();
    // one bill-linked vote
    db.prepare(
      `INSERT INTO roll_call_votes (id, chamber, congress, session, roll_call_number,
                                    bill_id, result, vote_question, start_date,
                                    source_adapter_id, source_tier, synced_at)
       VALUES ('vote-a', 'House', 119, 1, 10, '119-hr-10',
               'Passed', 'On Passage', '2026-04-01',
               'congressGov', 1, 1700000000000)`,
    ).run();
    // one procedural with no bill — should be excluded
    db.prepare(
      `INSERT INTO roll_call_votes (id, chamber, congress, session, roll_call_number,
                                    bill_id, result, vote_question, start_date,
                                    source_adapter_id, source_tier, synced_at)
       VALUES ('vote-b', 'House', 119, 1, 11, NULL,
               'Agreed to', 'Motion to Adjourn', '2026-04-02',
               'congressGov', 1, 1700000000000)`,
    ).run();

    const rows = listRecentBillVotes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.voteId).toBe("vote-a");
    expect(rows[0]!.billId).toBe("119-hr-10");
    expect(rows[0]!.billTitle).toBe("Bill Ten");
    expect(rows[0]!.result).toBe("Passed");
  });

  it("sorts newest first by start_date descending", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO bills (id, congress, bill_type, number, title,
                          last_synced, source_adapter_id, source_tier)
       VALUES ('119-hr-1', 119, 'HR', '1', 'Bill A',
               1700000000000, 'congressGov', 1),
              ('119-hr-2', 119, 'HR', '2', 'Bill B',
               1700000000000, 'congressGov', 1)`,
    ).run();
    db.prepare(
      `INSERT INTO roll_call_votes (id, chamber, congress, session, roll_call_number,
                                    bill_id, result, vote_question, start_date,
                                    source_adapter_id, source_tier, synced_at)
       VALUES ('vote-old', 'House', 119, 1, 1, '119-hr-1',
               'Passed', 'On Passage', '2026-01-01',
               'congressGov', 1, 1700000000000),
              ('vote-new', 'House', 119, 1, 2, '119-hr-2',
               'Passed', 'On Passage', '2026-04-01',
               'congressGov', 1, 1700000000000)`,
    ).run();

    const rows = listRecentBillVotes(db);
    expect(rows.map((r) => r.voteId)).toEqual(["vote-new", "vote-old"]);
  });

  it("returns null bill_title when the bill row is missing", () => {
    const db = openMemoryDb();
    db.prepare(
      `INSERT INTO roll_call_votes (id, chamber, congress, session, roll_call_number,
                                    bill_id, result, vote_question, start_date,
                                    source_adapter_id, source_tier, synced_at)
       VALUES ('vote-orphan', 'House', 119, 1, 99, '119-hr-999',
               'Passed', 'On Passage', '2026-04-01',
               'congressGov', 1, 1700000000000)`,
    ).run();
    const rows = listRecentBillVotes(db);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.billTitle).toBeNull();
  });

  it("respects the limit parameter", () => {
    const db = openMemoryDb();
    for (let i = 0; i < 5; i++) {
      db.prepare(
        `INSERT INTO roll_call_votes (id, chamber, congress, session, roll_call_number,
                                      bill_id, result, vote_question, start_date,
                                      source_adapter_id, source_tier, synced_at)
         VALUES (@id, 'House', 119, 1, @rc, @bill, 'Passed', 'Q', @date,
                 'congressGov', 1, 1700000000000)`,
      ).run({
        id: `v-${i}`,
        rc: i + 1,
        bill: `119-hr-${i + 1}`,
        date: `2026-04-0${i + 1}`,
      });
    }
    expect(listRecentBillVotes(db, 3)).toHaveLength(3);
  });
});
