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
import { upsertIssueStance } from "../domain/preferences/index.js";
import type { LlmClient } from "../domain/scoring/direction.js";
import {
  checkUpcomingVotesTool,
  renderCheckUpcomingVotesOutput,
  setMonitoringDirectionLlmForTests,
} from "./monitoring.js";
import type {
  CheckUpcomingVotesResult,
  ScoredBillChange,
} from "../domain/monitoring/upcomingVotes.js";
import type { StoredBill } from "../domain/bills/index.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const BILLS_FIXTURES = join(HERE, "..", "sources/bills/__fixtures__");
const EVENTS_FIXTURES = join(HERE, "..", "sources/upcomingVotes/__fixtures__");

function fixture(base: string, name: string): unknown {
  return JSON.parse(readFileSync(join(base, name), "utf8"));
}

type Route = { match: (url: string) => boolean; body: unknown; status?: number };

function routeFetch(routes: Route[]) {
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
  });
}

function withMemoryStorage() {
  const db = openMemoryDb();
  configureStorage(() => "/tmp/politiclaw-tests");
  setStorageForTests({ db, kv: new Kv(db) });
  return db;
}

function stubHappyPath() {
  vi.stubGlobal(
    "fetch",
    routeFetch([
      {
        match: (url) => /\/bill\/119\/hr(\?|$)/.test(url),
        body: fixture(BILLS_FIXTURES, "congress_bill_list_119_hr_2026-04-18.json"),
      },
      {
        match: (url) => url.includes("/committee-meeting/119?"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_list_119_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/house/116421"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116421_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/senate/116588"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116588_2026-04-19.json",
        ),
      },
      {
        match: (url) => url.includes("/committee-meeting/119/house/116600"),
        body: fixture(
          EVENTS_FIXTURES,
          "congress_committee_meeting_detail_116600_2026-04-19.json",
        ),
      },
    ]),
  );
}

let db: ReturnType<typeof openMemoryDb>;

beforeEach(() => {
  db = withMemoryStorage();
});

afterEach(() => {
  resetStorageConfigForTests();
  setMonitoringDirectionLlmForTests(null);
  vi.unstubAllGlobals();
});

describe("politiclaw_check_upcoming_votes tool — integration", () => {
  it("renders tiered sections and Class A digest lines on first run", async () => {
    stubHappyPath();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 2 });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Sources: bills via");
    expect(text).toMatch(/Digest — other tracked-issue movement:/);
    expect(text).toMatch(/\*\*HR-1234 — Clean Housing Investment Act of 2026\*\*/);
    expect(text).toContain("touches your `support` on `housing`");
    expect(text).toContain("informational, not independent journalism");
    expect(text).not.toContain("[new]");
    expect(text).not.toMatch(/\d+% relevance/);
  });

  it("returns an empty-delta summary on a second invocation with unchanged data", async () => {
    stubHappyPath();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    await checkUpcomingVotesTool.execute!("call-1", { congress: 119, billType: "HR" }, undefined, undefined);

    stubHappyPath();
    const second = await checkUpcomingVotesTool.execute!(
      "call-2",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (second.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("No new or materially changed items");
    expect(text).not.toContain("Interruptive");
    expect(text).not.toContain("Digest — ");
  });

  it("reports unavailable with actionable guidance when apiDataGov is missing", async () => {
    setPluginConfigForTests({ apiKeys: {} });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119 },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    expect(text).toContain("Check failed");
    expect(text).toContain("apiDataGov");
  });

  it("renders partial mode when only events fail and still tallies unchanged on re-run", async () => {
    vi.stubGlobal(
      "fetch",
      routeFetch([
        {
          match: (url) => /\/bill\/119\/hr(\?|$)/.test(url),
          body: fixture(BILLS_FIXTURES, "congress_bill_list_119_hr_2026-04-18.json"),
        },
        {
          match: (url) => url.includes("/committee-meeting"),
          body: {},
          status: 503,
        },
      ]),
    );
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });

    const result = await checkUpcomingVotesTool.execute!(
      "call-1",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const text = (result.content[0] as { type: "text"; text: string }).text;

    // Three unmatched-stance bills land in the tail
    expect(text).toContain("Also changed: 3 bills");
    expect(text).toContain("upcoming events:");
    expect(text).toContain("503");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Direct renderer tests — bypass the full pipeline to pin down per-class
// output shapes without a fixture server. Each test constructs the shape of
// CheckUpcomingVotesResult that the engine would produce.
// ───────────────────────────────────────────────────────────────────────────

function baseResult(
  overrides: Partial<CheckUpcomingVotesResult> = {},
): CheckUpcomingVotesResult {
  return {
    status: "ok",
    changedBills: [],
    unchangedBillCount: 0,
    mutedBillCount: 0,
    changedEvents: [],
    unchangedEventCount: 0,
    mutedEventCount: 0,
    source: {
      bills: { adapterId: "congressGov", tier: 1 },
      events: { adapterId: "congressGov.committeeMeetings", tier: 1 },
    },
    reasons: {},
    ...overrides,
  };
}

function makeBill(overrides: Partial<StoredBill> = {}): StoredBill {
  return {
    id: "119-hr-1234",
    congress: 119,
    billType: "HR",
    number: "1234",
    title: "Clean Housing Investment Act of 2026",
    latestActionDate: "2026-04-10",
    latestActionText: "Referred to the House Committee on Financial Services.",
    policyArea: "Housing and Community Development",
    subjects: ["Affordable housing"],
    summaryText: "Expands LIHTC allocation by 50%.",
    lastSynced: Date.now(),
    sourceAdapterId: "congressGov",
    sourceTier: 1,
    ...overrides,
  };
}

function tier1Entry(
  overrides: Partial<ScoredBillChange> = {},
): ScoredBillChange {
  return {
    bill: makeBill(),
    change: { changed: true, reason: "changed", hash: "abc", previousHash: "xyz" } as ScoredBillChange["change"],
    alignment: {
      relevance: 0.8,
      confidence: 0.75,
      matches: [
        {
          issue: "affordable-housing",
          stance: "support",
          stanceWeight: 4,
          location: "policyArea",
          matchedText: "policy area 'Housing and Community Development'",
        },
      ],
      rationale: "Bill 119 HR 1234 touches: affordable-housing.",
      stanceSnapshotHash: "hash1",
      belowConfidenceFloor: false,
    },
    direction: null,
    tier: "tier1",
    ...overrides,
  };
}

describe("renderCheckUpcomingVotesOutput — per-class shapes", () => {
  it("renders schema-bump-only delta as a single baseline-updated footer", () => {
    const bump: ScoredBillChange = {
      bill: makeBill(),
      change: { changed: true, reason: "schema_bump", hash: "a", previousHash: "b" } as ScoredBillChange["change"],
      alignment: null,
      direction: null,
      tier: "schema_bump",
    };
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [bump] }),
    );
    expect(text).toContain("Baseline updated for 1 bill — no real change");
    expect(text).not.toContain("Interruptive");
    expect(text).not.toContain("Digest — ");
    expect(text).not.toContain("Also changed");
  });

  it("renders Class A interruptive with headline, why-it-matters, next-step", () => {
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [tier1Entry()] }),
    );
    expect(text).toContain("Interruptive — high-relevance changes:");
    expect(text).toContain(
      "**HR-1234 — Clean Housing Investment Act of 2026** referred to committee",
    );
    expect(text).toContain(
      "Why it matters: touches your `support` on `affordable-housing`",
    );
    expect(text).toContain("Next: politiclaw_draft_outreach (format='letter') to weigh in");
    expect(text).toContain(
      "https://www.congress.gov/bill/119/house-bill/1234",
    );
    expect(text).not.toMatch(/\d+% relevance/);
  });

  it("renders Class A with quoted bill text and counter-consideration when direction is wired", () => {
    const entry = tier1Entry({
      direction: [
        {
          issue: "affordable-housing",
          stance: "support",
          direction: {
            kind: "advances",
            confidence: 0.8,
            rationale: "Title names LIHTC expansion.",
            quotedText: "expands LIHTC allocation by 50%",
            counterConsideration:
              "Expansion is funded by redirecting opportunity-zone credits, which concentrates investment in already-dense metros.",
          },
        },
      ],
    });
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [entry] }),
    );
    expect(text).toContain(
      'bill text: "expands LIHTC allocation by 50%"',
    );
    expect(text).toContain(
      "Counter-consideration: Expansion is funded by redirecting opportunity-zone credits",
    );
  });

  it("renders direction-unclear fallback when the LLM returns unclear", () => {
    const entry = tier1Entry({
      direction: [
        {
          issue: "affordable-housing",
          stance: "support",
          direction: { kind: "unclear", rationale: "not enough bill text to ground a claim" },
        },
      ],
    });
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [entry] }),
    );
    expect(text).toContain(
      "Direction unclear; no stance-grounded quote in available text",
    );
    expect(text).not.toContain("Counter-consideration:");
  });

  it("omits Next line for bills that already became law", () => {
    const enacted = tier1Entry({
      bill: makeBill({
        latestActionText: "Became Public Law No. 119-45.",
        latestActionDate: "2026-04-01",
      }),
    });
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [enacted] }),
    );
    expect(text).toContain("signed into law");
    expect(text).not.toContain("Next:");
  });

  it("caps tier-1 at 3 items and rolls overflow into the tail", () => {
    const entries: ScoredBillChange[] = [];
    for (let i = 1; i <= 5; i++) {
      entries.push(
        tier1Entry({
          bill: makeBill({
            id: `119-hr-${1000 + i}`,
            number: `${1000 + i}`,
            title: `Tier One Bill ${i}`,
          }),
        }),
      );
    }
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: entries }),
    );
    const interruptiveMatches = text.match(/Tier One Bill \d/g) ?? [];
    expect(interruptiveMatches).toHaveLength(3);
    expect(text).toContain("Also changed: 2 bills");
  });

  it("renders the tail with topic counts when tier-3 bills have stance matches", () => {
    const lowMatch: ScoredBillChange = {
      bill: makeBill({ id: "119-hr-9999", number: "9999", title: "Fringe Bill" }),
      change: { changed: true, reason: "changed", hash: "z", previousHash: "y" } as ScoredBillChange["change"],
      alignment: {
        relevance: 0.2,
        confidence: 0.5,
        matches: [
          {
            issue: "health",
            stance: "support",
            stanceWeight: 2,
            location: "summary",
            matchedText: "summary keyword 'health'",
          },
        ],
        rationale: "",
        stanceSnapshotHash: "h",
        belowConfidenceFloor: false,
      },
      direction: null,
      tier: "tier3",
    };
    const text = renderCheckUpcomingVotesOutput(
      baseResult({ changedBills: [lowMatch] }),
    );
    expect(text).toContain("Also changed: 1 bill — 1 touching `health`");
  });

  it("renders Class B event with headline, date, location, and future-hearing Next", () => {
    const future = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
    const text = renderCheckUpcomingVotesOutput(
      baseResult({
        changedBills: [tier1Entry()],
        changedEvents: [
          {
            event: {
              id: "119-house-hearing-42",
              congress: 119,
              chamber: "House",
              eventType: "hearing",
              title: "Markup: HR-1234",
              startDateTime: future,
              location: "Rayburn 2141",
              committeeName: "House Financial Services",
              relatedBillIds: ["119-hr-1234"],
            },
            change: { changed: true, reason: "new", hash: "e", previousHash: null } as ChangedEventChange,
            tier: "tier1",
          },
        ],
      }),
    );
    expect(text).toContain(
      "**House Financial Services — Markup: HR-1234**",
    );
    expect(text).toContain("(Rayburn 2141)");
    expect(text).toContain("Related bills: 119-hr-1234.");
    expect(text).toContain(
      "Next: politiclaw_draft_outreach with format='letter' if you want to weigh in before the hearing",
    );
  });

  it("omits event Next line for past hearings", () => {
    const past = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    const text = renderCheckUpcomingVotesOutput(
      baseResult({
        changedBills: [tier1Entry()],
        changedEvents: [
          {
            event: {
              id: "119-house-hearing-1",
              congress: 119,
              chamber: "House",
              eventType: "hearing",
              title: "Markup: HR-1234",
              startDateTime: past,
              committeeName: "House Financial Services",
              relatedBillIds: ["119-hr-1234"],
            },
            change: { changed: true, reason: "new", hash: "e", previousHash: null } as ChangedEventChange,
            tier: "tier1",
          },
        ],
      }),
    );
    expect(text).not.toContain("Next: politiclaw_draft_outreach with format='letter' if you want to weigh");
  });

  it("renders muted-note when mutes exist alongside real changes", () => {
    const text = renderCheckUpcomingVotesOutput(
      baseResult({
        changedBills: [tier1Entry()],
        mutedBillCount: 2,
      }),
    );
    expect(text).toContain("(2 bills suppressed by mute list");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Direction-LLM wiring — integration path that verifies the test seam lets
// us inject a fake client and get a counter-consideration through the full
// renderer without touching an external LLM.
// ───────────────────────────────────────────────────────────────────────────

describe("direction LLM wiring", () => {
  it("invokes the injected LLM and attaches direction to bills above the confidence floor", async () => {
    stubHappyPath();
    setPluginConfigForTests({ apiKeys: { apiDataGov: "k" } });
    // Three stances lift confidence above the 0.4 floor, so direction is
    // computed for the housing-matched bill. Fewer stances would land the bill
    // in tier 3 and short-circuit the LLM call.
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 5 });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 3 });
    upsertIssueStance(db, { issue: "taxation", stance: "oppose", weight: 2 });

    const reasonCalls: unknown[] = [];
    const fakeLlm: LlmClient = {
      async reason(args: unknown) {
        reasonCalls.push(args);
        return {
          kind: "advances",
          confidence: 0.8,
          rationale: "Housing policy area match.",
          quotedText: "clean housing investment act",
          counterConsideration:
            "Funded by redirecting opportunity-zone credits per fiscal note.",
        };
      },
    };
    setMonitoringDirectionLlmForTests(fakeLlm);

    const result = await checkUpcomingVotesTool.execute!(
      "call-dir",
      { congress: 119, billType: "HR" },
      undefined,
      undefined,
    );
    const details = (result as { details: CheckUpcomingVotesResult }).details;
    expect(reasonCalls.length).toBeGreaterThan(0);
    const housingEntry = details.changedBills.find((b) =>
      b.bill.title.toLowerCase().includes("housing"),
    );
    expect(housingEntry).toBeDefined();
    expect(housingEntry?.direction).not.toBeNull();
    expect(housingEntry?.direction?.[0]?.direction.kind).toBe("advances");
  });
});

type ChangedEventChange = {
  changed: true;
  reason: "new" | "changed" | "schema_bump";
  hash: string;
  previousHash: string | null;
};
