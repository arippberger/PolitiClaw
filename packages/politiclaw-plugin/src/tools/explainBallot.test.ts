import { describe, it, expect, beforeEach, afterEach } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import {
  upsertIssueStance,
  upsertPreferences,
} from "../domain/preferences/index.js";
import { renderExplainMyBallotOutput } from "./explainBallot.js";
import type { ExplainMyBallotResult } from "../domain/ballot/explain.js";
import { explainMyBallotTool } from "./explainBallot.js";

function okResult(overrides: Partial<ExplainMyBallotResult> = {}): ExplainMyBallotResult {
  return {
    status: "ok",
    addressLine: "123 Main St, 94101, CA",
    election: { id: "el", name: "2026 General", electionDay: "2026-11-03" },
    ballotSource: { adapterId: "googleCivic", tier: 2 },
    fromCache: false,
    stanceSnapshotHash: "abc123",
    contests: [],
    insufficientDataCount: 0,
    ...overrides,
  } as ExplainMyBallotResult;
}

describe("renderExplainMyBallotOutput", () => {
  it("renders no_preferences with actionable hint", () => {
    const text = renderExplainMyBallotOutput({
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    });
    expect(text).toContain("no address on file");
    expect(text).toContain("politiclaw_configure");
  });

  it("renders no_stances with actionable hint", () => {
    const text = renderExplainMyBallotOutput({
      status: "no_stances",
      reason: "no declared issue stances",
      actionable: "call politiclaw_set_issue_stance first",
    });
    expect(text).toContain("politiclaw_set_issue_stance");
  });

  it("renders unavailable with adapter hint", () => {
    const text = renderExplainMyBallotOutput({
      status: "unavailable",
      reason: "googleCivic key is not configured",
      actionable: "Set plugins.politiclaw.apiKeys.googleCivic.",
      adapterId: "googleCivic",
    });
    expect(text).toContain("googleCivic");
    expect(text).toContain("Set plugins.politiclaw");
  });

  it("always includes the no-recommendation notice and alignment disclaimer", () => {
    const text = renderExplainMyBallotOutput(okResult());
    expect(text).toContain("stops short of telling you how to vote");
    expect(text).toContain("that call is yours");
    expect(text).toContain("informational, not independent journalism");
    expect(text).toContain("Directional framing");
  });

  it("appends the verify disclaimer only when bios are rendered", () => {
    const withoutBios = renderExplainMyBallotOutput(
      okResult({
        contests: [
          {
            index: 1,
            title: "Prop 15",
            contestType: "measure",
            coverageLabel: "PARTIAL — from Google Civic",
            stanceMatches: [],
            framing: [{ prefix: "A YES vote would", body: "do X." }],
            candidateBios: [],
            insufficientData: false,
          },
        ],
      }),
    );
    expect(withoutBios).not.toContain("LLM-search-derived summaries");

    const withBios = renderExplainMyBallotOutput(
      okResult({
        contests: [
          {
            index: 1,
            title: "CA-12 House",
            contestType: "candidate",
            coverageLabel: "PARTIAL — from Google Civic",
            stanceMatches: [],
            framing: [{ prefix: "What this race decides", body: "CA-12 rep." }],
            candidateBios: [
              {
                candidateName: "A. Example",
                source: { adapterId: "webSearch.bios", tier: 2 },
                payload: {
                  category: "candidate.bio",
                  narrativeText: "Prior office: CA State Senate.",
                  citations: [
                    {
                      url: "https://ballotpedia.org/A_Example",
                      retrievedAt: 1,
                    },
                  ],
                },
              },
            ],
            insufficientData: false,
          },
        ],
      }),
    );
    expect(withBios).toContain("LLM-search-derived summaries");
    expect(withBios).toContain("ballotpedia.org/A_Example");
  });

  it("flags insufficient data footer when any contest lacks stance match + bio", () => {
    const text = renderExplainMyBallotOutput(
      okResult({
        insufficientDataCount: 2,
        contests: [
          {
            index: 1,
            title: "Trustee",
            contestType: "candidate",
            coverageLabel: "NOT COVERED",
            stanceMatches: [],
            framing: [],
            candidateBios: [],
            insufficientData: true,
          },
        ],
      }),
    );
    expect(text).toContain("2 contests flagged as insufficient data");
  });

  it("never contains a prescriptive recommendation verb", () => {
    const text = renderExplainMyBallotOutput(
      okResult({
        contests: [
          {
            index: 1,
            title: "CA-12 House",
            contestType: "candidate",
            coverageLabel: "PARTIAL",
            stanceMatches: [
              {
                issue: "housing",
                stance: "support",
                stanceWeight: 4,
                matchedText: "title keyword 'house'",
              },
            ],
            framing: [
              { prefix: "What this race decides", body: "who represents you." },
              {
                prefix: "What the candidate rows below show",
                body: "names and party labels.",
              },
            ],
            candidateBios: [],
            insufficientData: false,
          },
        ],
      }),
    );
    const lower = text.toLowerCase();
    expect(lower).not.toMatch(/\byou should vote\b/);
    expect(lower).not.toMatch(/\bvote (yes|no|for|against)\b/);
    expect(lower).not.toMatch(/\bwe recommend\b/);
  });
});

describe("politiclaw_explain_my_ballot — execute", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
  });
  afterEach(() => {
    resetStorageConfigForTests();
  });

  it("returns no_stances before any remote call when stances are not set", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "CA" });
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: { googleCivic: "fake" } });

    const result = await explainMyBallotTool.execute("call-1", {});
    const textBlock = result.content?.[0];
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textBlock.text).toContain("no declared issue stances");
  });

  it("returns unavailable when googleCivic key is absent", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "CA" });
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: {} });

    const result = await explainMyBallotTool.execute("call-1", {});
    const textBlock = result.content?.[0];
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("expected text content");
    }
    expect(textBlock.text).toContain("unavailable");
    expect(textBlock.text).toContain("googleCivic");
  });
});
