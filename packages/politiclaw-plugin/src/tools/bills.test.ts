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
import { getBillDetailsTool, searchBillsTool } from "./bills.js";

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

beforeEach(() => {
  withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
  vi.unstubAllGlobals();
});

describe("politiclaw_search_bills tool", () => {
  it("returns a rendered bill list when apiDataGov key is configured", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => url.includes("/bill/119/hr"),
          body: fixture("congress_bill_list_119_hr_2026-04-18.json"),
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await searchBillsTool.execute!(
      "call-1",
      { congress: 119, billType: "HR", limit: 5 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Clean Housing Investment Act");
    expect(text).toContain("congressGov");
    expect(text).toContain("tier 1");
  });

  it("renders bill summary lines with a space on both sides of the em-dash separator", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => url.includes("/bill/119/hr"),
          body: fixture("congress_bill_list_119_hr_2026-04-18.json"),
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await searchBillsTool.execute!(
      "call-1",
      { congress: 119, billType: "HR", limit: 5 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Act of 2026 — 2026-04-10 Referred to the House Committee");
    expect(text).not.toMatch(/Act of 2026—/);
    expect(text).not.toMatch(/ {2}Referred/);
  });

  it("returns actionable unavailable message when apiDataGov key is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });

    const result = await searchBillsTool.execute!("call-1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("unavailable");
    expect(text).toContain("apiDataGov");
  });

  it("rejects an invalid billType with actionable feedback", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await searchBillsTool.execute!(
      "call-1",
      { billType: "BOGUS" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Unknown billType");
    expect(text).toContain("HR");
  });

  it("applies title substring filter to rendered list", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => url.includes("/bill/119/hr"),
          body: fixture("congress_bill_list_119_hr_2026-04-18.json"),
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await searchBillsTool.execute!(
      "call-1",
      { congress: 119, billType: "HR", titleContains: "carbon" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Carbon Border Adjustment Act");
    expect(text).not.toContain("Clean Housing");
    expect(text).not.toContain("Small Business");
  });
});

describe("politiclaw_get_bill_details tool", () => {
  it("renders sponsor, subjects, and summary from api.congress.gov detail shape", async () => {
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
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await getBillDetailsTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Bill 119 HR 1234");
    expect(text).toContain("Clean Housing Investment Act");
    expect(text).toContain("Housing and Community Development");
    expect(text).toContain("Affordable housing");
    expect(text).toContain("Pelosi");
    expect(text).toContain("affordable housing stock");
    expect(text).not.toMatch(/<[a-z]/i);
  });

  it("accepts congress/billType/number tuple as an alternative to billId", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => /\/bill\/119\/hr\/1234($|\?)/.test(url),
          body: fixture("congress_bill_detail_119_hr_1234_2026-04-18.json"),
        },
        {
          match: (url) => url.includes("/subjects"),
          body: { subjects: {} },
        },
        {
          match: (url) => url.includes("/summaries"),
          body: { summaries: [] },
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await getBillDetailsTool.execute!(
      "call-1",
      { congress: 119, billType: "hr", number: "1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Clean Housing Investment Act");
  });

  it("rejects malformed billId values with actionable feedback", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    const result = await getBillDetailsTool.execute!(
      "call-1",
      { billId: "bogus" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("Could not parse");
  });

  it("surfaces unavailable when apiDataGov is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });
    const result = await getBillDetailsTool.execute!(
      "call-1",
      { billId: "119-hr-1234" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("unavailable");
    expect(text).toContain("apiDataGov");
  });
});
