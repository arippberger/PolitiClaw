import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createCongressGovAdapter } from "./congressGov.js";

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
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
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

describe("congressGov adapter: list", () => {
  it("normalizes api.congress.gov bill list responses", async () => {
    const { fetcher, calls } = routeFetch([
      {
        match: (url) => url.includes("/bill/119/hr"),
        body: fixture("congress_bill_list_119_hr_2026-04-18.json"),
      },
    ]);
    const adapter = createCongressGovAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({ congress: 119, billType: "HR", limit: 3 });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("congressGov");
    expect(result.tier).toBe(1);
    expect(result.data).toHaveLength(3);

    const first = result.data[0]!;
    expect(first.id).toBe("119-hr-1234");
    expect(first.billType).toBe("HR");
    expect(first.title).toBe("Clean Housing Investment Act of 2026");
    expect(first.originChamber).toBe("House");
    expect(first.latestActionText).toContain("Financial Services");
    expect(first.sourceUrl).toBe("https://api.congress.gov/v3/bill/119/hr/1234?format=json");

    expect(calls[0]).toContain("api_key=k");
    expect(calls[0]).toContain("limit=3");
    expect(calls[0]).toContain("/bill/119/hr");
  });

  it("applies client-side title substring filter", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => url.includes("/bill/119/hr"),
        body: fixture("congress_bill_list_119_hr_2026-04-18.json"),
      },
    ]);
    const adapter = createCongressGovAdapter({ apiKey: "k", fetcher });

    const result = await adapter.list({
      congress: 119,
      billType: "HR",
      titleContains: "housing",
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data).toHaveLength(1);
    expect(result.data[0]!.id).toBe("119-hr-1234");
  });

  it("returns unavailable when the api key is missing", async () => {
    const adapter = createCongressGovAdapter({ apiKey: "" });
    const result = await adapter.list({ congress: 119, billType: "HR" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("apiDataGov");
    expect(result.actionable).toContain("plugins.politiclaw.apiKeys.apiDataGov");
  });

  it("surfaces http errors as structured unavailable results", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, { ok: false, status: 403 }));
    const adapter = createCongressGovAdapter({ apiKey: "k", fetcher });
    const result = await adapter.list({ congress: 119, billType: "HR" });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("http 403");
    expect(result.actionable).toContain("quota");
  });
});

describe("congressGov adapter: get", () => {
  it("fetches bill detail + subjects + summary from sub-resources", async () => {
    const { fetcher, calls } = routeFetch([
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
    ]);
    const adapter = createCongressGovAdapter({ apiKey: "k", fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.id).toBe("119-hr-1234");
    expect(result.data.introducedDate).toBe("2026-01-30");
    expect(result.data.policyArea).toBe("Housing and Community Development");
    expect(result.data.sponsors?.[0]?.bioguideId).toBe("P000197");
    expect(result.data.sponsors?.[0]?.fullName).toContain("Pelosi");
    expect(result.data.subjects).toContain("Affordable housing");
    expect(result.data.summaryText).toContain("affordable housing stock");

    expect(calls.length).toBe(3);
  });

  it("returns a bill even when subject/summary sub-resources fail", async () => {
    const { fetcher } = routeFetch([
      {
        match: (url) => /\/bill\/119\/hr\/1234($|\?)/.test(url),
        body: fixture("congress_bill_detail_119_hr_1234_2026-04-18.json"),
      },
      {
        match: (url) => url.includes("/subjects"),
        body: {},
        ok: false,
        status: 500,
      },
      {
        match: (url) => url.includes("/summaries"),
        body: {},
        ok: false,
        status: 500,
      },
    ]);
    const adapter = createCongressGovAdapter({ apiKey: "k", fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.title).toBe("Clean Housing Investment Act of 2026");
    expect(result.data.summaryText).toBeUndefined();
  });
});
