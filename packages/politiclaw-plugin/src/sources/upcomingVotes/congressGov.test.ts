import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { createCongressGovUpcomingAdapter } from "./congressGov.js";

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), "utf8"));
}

type Route = { match: (url: string) => boolean; body: unknown; status?: number };

function routeFetch(routes: Route[]): typeof fetch {
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
  }) as unknown as typeof fetch;
}

const BASE = "https://api.test/v3";
const LIST = fixture("congress_committee_meeting_list_119_2026-04-19.json");
const DETAIL_116421 = fixture("congress_committee_meeting_detail_116421_2026-04-19.json");
const DETAIL_116588 = fixture("congress_committee_meeting_detail_116588_2026-04-19.json");
const DETAIL_116600 = fixture("congress_committee_meeting_detail_116600_2026-04-19.json");

function createAdapter(fetcher: typeof fetch) {
  return createCongressGovUpcomingAdapter({
    apiKey: "k",
    fetcher,
    now: () => 1_700_000_000_000,
    baseUrl: BASE,
  });
}

describe("congressGov upcoming-votes adapter", () => {
  it("returns unavailable when apiKey is missing", async () => {
    const adapter = createCongressGovUpcomingAdapter({
      apiKey: "",
      fetcher: routeFetch([]),
      baseUrl: BASE,
    });
    const result = await adapter.list({ congress: 119 });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("apiDataGov");
    expect(result.actionable).toContain("apiDataGov");
  });

  it("hydrates each stub via its detail URL and normalizes relatedBillIds", async () => {
    const fetcher = routeFetch([
      { match: (url) => url.includes("/committee-meeting/119?"), body: LIST },
      { match: (url) => url.includes("/committee-meeting/119/house/116421"), body: DETAIL_116421 },
      { match: (url) => url.includes("/committee-meeting/119/senate/116588"), body: DETAIL_116588 },
      { match: (url) => url.includes("/committee-meeting/119/house/116600"), body: DETAIL_116600 },
    ]);

    const adapter = createAdapter(fetcher);
    const result = await adapter.list({ congress: 119 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const byId = new Map(result.data.map((event) => [event.id, event]));
    const housing = byId.get("119-house-hearing-116421");
    expect(housing).toBeDefined();
    expect(housing?.title).toContain("Affordable Housing");
    expect(housing?.relatedBillIds).toEqual(["119-hr-1234", "119-hr-5678"]);
    expect(housing?.committeeName).toBe("Committee on Financial Services");
    expect(housing?.location).toBe("2128, Rayburn House Office Building");
    expect(housing?.sourceUrl).not.toContain("api_key=");

    const clean = byId.get("119-senate-markup-116588");
    expect(clean?.chamber).toBe("Senate");
    expect(clean?.eventType).toBe("markup");
  });

  it("applies chamber + date filters against hydrated events", async () => {
    const fetcher = routeFetch([
      { match: (url) => url.includes("/committee-meeting/119?"), body: LIST },
      { match: (url) => url.includes("/committee-meeting/119/house/116421"), body: DETAIL_116421 },
      { match: (url) => url.includes("/committee-meeting/119/senate/116588"), body: DETAIL_116588 },
      { match: (url) => url.includes("/committee-meeting/119/house/116600"), body: DETAIL_116600 },
    ]);
    const adapter = createAdapter(fetcher);

    const senateOnly = await adapter.list({ congress: 119, chamber: "Senate" });
    expect(senateOnly.status).toBe("ok");
    if (senateOnly.status !== "ok") return;
    expect(senateOnly.data.map((event) => event.id)).toEqual([
      "119-senate-markup-116588",
    ]);

    const lateWindow = await adapter.list({
      congress: 119,
      fromDateTime: "2026-04-23T00:00:00Z",
    });
    expect(lateWindow.status).toBe("ok");
    if (lateWindow.status !== "ok") return;
    expect(lateWindow.data.map((event) => event.id)).toEqual([
      "119-senate-markup-116588",
      "119-house-committee_meeting-116600",
    ]);
  });

  it("skips detail fetches that fail without collapsing the list", async () => {
    const fetcher = routeFetch([
      { match: (url) => url.includes("/committee-meeting/119?"), body: LIST },
      {
        match: (url) => url.includes("/committee-meeting/119/house/116421"),
        body: { error: { message: "transient 500" } },
        status: 500,
      },
      { match: (url) => url.includes("/committee-meeting/119/senate/116588"), body: DETAIL_116588 },
      { match: (url) => url.includes("/committee-meeting/119/house/116600"), body: DETAIL_116600 },
    ]);

    const adapter = createAdapter(fetcher);
    const result = await adapter.list({ congress: 119 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;

    const ids = result.data.map((event) => event.id);
    expect(ids).not.toContain("119-house-hearing-116421");
    expect(ids).toContain("119-senate-markup-116588");
  });

  it("surfaces a 403/429 with actionable guidance from the list endpoint", async () => {
    const fetcher = routeFetch([
      {
        match: (url) => url.includes("/committee-meeting/119?"),
        body: {},
        status: 429,
      },
    ]);
    const adapter = createAdapter(fetcher);
    const result = await adapter.list({ congress: 119 });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("429");
    expect(result.actionable).toContain("apiDataGov");
  });
});
