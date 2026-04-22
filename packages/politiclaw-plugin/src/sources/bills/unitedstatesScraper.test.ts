import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createUnitedstatesScraperAdapter } from "./unitedstatesScraper.js";

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

function textResponse(body: string, { ok = true, status = 200 } = {}): Response {
  return {
    ok,
    status,
    async json() {
      return JSON.parse(body);
    },
  } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
});

const BASE_URL = "https://mirror.example.test/congress";

describe("unitedstatesScraper adapter: get", () => {
  it("normalizes scraper data.json to the canonical Bill shape", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: URL | string | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      calls.push(url);
      return jsonResponse(fixture("scraper_bill_detail_119_hr_1234_2026-04-22.json"));
    });

    const adapter = createUnitedstatesScraperAdapter({
      baseUrl: BASE_URL,
      fetcher,
      now: () => 1_700_000_000_000,
    });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(calls[0]).toBe(`${BASE_URL}/119/bills/hr/hr1234/data.json`);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("unitedstatesScraper");
    expect(result.tier).toBe(2);
    expect(result.data.id).toBe("119-hr-1234");
    expect(result.data.congress).toBe(119);
    expect(result.data.billType).toBe("HR");
    expect(result.data.title).toBe("Clean Housing Investment Act of 2026");
    expect(result.data.policyArea).toBe("Housing and Community Development");
    expect(result.data.subjects).toEqual([
      "Affordable housing",
      "Federal housing programs",
      "Housing finance",
    ]);
    expect(result.data.summaryText).toMatch(/energy-efficient affordable housing/);
    expect(result.data.latestActionDate).toBe("2026-04-10");
    expect(result.data.latestActionText).toMatch(/Financial Services/);
    expect(result.data.sponsors?.[0]).toMatchObject({
      bioguideId: "P000197",
      fullName: "Rep. Pelosi, Nancy",
      party: "D",
      state: "CA",
      district: "11",
    });
  });

  it("strips trailing slashes from baseUrl", async () => {
    const calls: string[] = [];
    const fetcher = vi.fn(async (input: URL | string | Request) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      calls.push(url);
      return jsonResponse(fixture("scraper_bill_detail_119_hr_1234_2026-04-22.json"));
    });

    const adapter = createUnitedstatesScraperAdapter({
      baseUrl: `${BASE_URL}///`,
      fetcher,
    });
    await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(calls[0]).toBe(`${BASE_URL}/119/bills/hr/hr1234/data.json`);
  });

  it("returns unavailable with a distinct reason on 404", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, { ok: false, status: 404 }));
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "9999" });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("bill not found");
  });

  it("returns unavailable on non-404 http errors", async () => {
    const fetcher = vi.fn(async () => jsonResponse({}, { ok: false, status: 503 }));
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("http 503");
  });

  it("returns unavailable on malformed json", async () => {
    const fetcher = vi.fn(async () => textResponse("{ not json"));
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toMatch(/malformed json/);
  });

  it("returns unavailable on fetch exceptions", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("econnrefused");
    });
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("econnrefused");
  });

  it("falls back to the requested ref when scraper payload lacks identifiers", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        official_title: "Untagged bill",
        subjects: ["Housing"],
      }),
    );
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.get({ congress: 119, billType: "HR", number: "1234" });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.id).toBe("119-hr-1234");
    expect(result.data.title).toBe("Untagged bill");
  });
});

describe("unitedstatesScraper adapter: list", () => {
  it("returns unavailable with a pointer to apiDataGov", async () => {
    const fetcher = vi.fn();
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL, fetcher });

    const result = await adapter.list({ congress: 119, billType: "HR" });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("does not support");
    expect(result.actionable).toContain("apiDataGov");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("unitedstatesScraper adapter: health", () => {
  it("reports degraded when baseUrl is present", async () => {
    const adapter = createUnitedstatesScraperAdapter({ baseUrl: BASE_URL });
    const health = await adapter.health();
    expect(health.status).toBe("degraded");
  });
});
