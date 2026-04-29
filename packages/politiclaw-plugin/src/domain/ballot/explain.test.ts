import { describe, it, expect } from "vitest";

import { openMemoryDb } from "../../storage/sqlite.js";
import type { BallotResolver } from "../../sources/ballot/index.js";
import type {
  NormalizedBallotContest,
  NormalizedBallotSnapshot,
} from "../../sources/ballot/types.js";
import type {
  BioLookupQuery,
  BioPayload,
  WebSearchResolver,
} from "../../sources/webSearch/index.js";
import {
  upsertIssueStance,
  upsertPreferences,
} from "../preferences/index.js";
import { explainMyBallot } from "./explain.js";

function stubBallotResolver(snapshot: NormalizedBallotSnapshot): BallotResolver {
  return {
    async voterInfo() {
      return {
        status: "ok",
        adapterId: "googleCivic",
        tier: 2,
        data: snapshot,
        fetchedAt: 1_700_000_000,
      };
    },
  };
}

function stubUnavailableResolver(): BallotResolver {
  return {
    async voterInfo() {
      return {
        status: "unavailable",
        adapterId: "googleCivic",
        reason: "googleCivic key is not configured",
        actionable: "Set plugins.entries.politiclaw.config.apiKeys.googleCivic.",
      };
    },
  };
}

function candidateContest(
  office: string,
  candidates: { name: string; party?: string }[],
): NormalizedBallotContest {
  return {
    office,
    candidates: candidates.map((c) => ({ name: c.name, party: c.party })),
  };
}

function measureContest(title: string, subtitle?: string): NormalizedBallotContest {
  return {
    referendumTitle: title,
    referendumSubtitle: subtitle,
    candidates: [],
  };
}

function baseSnapshot(contests: NormalizedBallotContest[]): NormalizedBallotSnapshot {
  return {
    election: { id: "el-1", name: "2026 General", electionDay: "2026-11-03" },
    contests,
    primaryPolling: null,
    pollingLocationCount: 0,
    registrationUrl: null,
    electionAdministrationUrl: null,
  };
}

function seedPrefsAndStances(
  db: ReturnType<typeof openMemoryDb>,
  stances: { issue: string; stance: "support" | "oppose"; weight?: number }[],
): void {
  upsertPreferences(db, {
    address: "123 Main St",
    zip: "94101",
    state: "CA",
  });
  for (const s of stances) {
    upsertIssueStance(db, {
      issue: s.issue,
      stance: s.stance,
      weight: s.weight ?? 3,
    });
  }
}

describe("explainMyBallot — preconditions", () => {
  it("returns no_stances when no issue stances are declared", async () => {
    const db = openMemoryDb();
    upsertPreferences(db, { address: "123 Main St", state: "CA" });
    const resolver = stubBallotResolver(baseSnapshot([]));
    const result = await explainMyBallot(db, resolver);
    expect(result.status).toBe("no_stances");
    if (result.status !== "no_stances") return;
    expect(result.actionable).toContain("politiclaw_issue_stances");
  });

  it("returns no_preferences when no address is on file", async () => {
    const db = openMemoryDb();
    upsertIssueStance(db, { issue: "housing", stance: "support", weight: 3 });
    const resolver = stubBallotResolver(baseSnapshot([]));
    const result = await explainMyBallot(db, resolver);
    expect(result.status).toBe("no_preferences");
  });

  it("surfaces an unavailable resolver with actionable hint", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [{ issue: "housing", stance: "support" }]);
    const result = await explainMyBallot(db, stubUnavailableResolver());
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.adapterId).toBe("googleCivic");
    expect(result.actionable).toContain("googleCivic");
  });
});

describe("explainMyBallot — deterministic framing", () => {
  it("renders YES/NO measure framing with published subtitle when present", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "affordable-housing", stance: "support", weight: 4 },
    ]);
    const snapshot = baseSnapshot([
      measureContest(
        "Prop 15: Affordable Housing Bond",
        "Authorizes $5B in general-obligation bonds for affordable housing.",
      ),
    ]);
    const result = await explainMyBallot(db, stubBallotResolver(snapshot));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const contest = result.contests[0]!;
    expect(contest.contestType).toBe("measure");
    const prefixes = contest.framing.map((f) => f.prefix);
    expect(prefixes).toContain("Summary (as published)");
    expect(prefixes).toContain("A YES vote would");
    expect(prefixes).toContain("A NO vote would");
    expect(contest.stanceMatches).toHaveLength(1);
    expect(contest.stanceMatches[0]?.issue).toBe("affordable-housing");
    expect(contest.insufficientData).toBe(false);
  });

  it("renders candidate-race framing without picking a candidate", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "housing", stance: "support", weight: 3 },
    ]);
    const snapshot = baseSnapshot([
      candidateContest("U.S. Representative, CA-12", [
        { name: "Alex Example", party: "Democratic" },
        { name: "Bea Example", party: "Republican" },
      ]),
    ]);
    const result = await explainMyBallot(db, stubBallotResolver(snapshot));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const contest = result.contests[0]!;
    expect(contest.contestType).toBe("candidate");
    const framingBody = contest.framing.map((f) => f.body).join("\n").toLowerCase();
    expect(framingBody).not.toContain("vote yes");
    expect(framingBody).not.toContain("vote no");
    expect(framingBody).not.toContain("recommend");
    expect(framingBody).not.toContain("endorse");
  });

  it("marks contests with no stance match and no bios as insufficient data", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "climate", stance: "support", weight: 3 },
    ]);
    const snapshot = baseSnapshot([
      candidateContest("Sanitary District Trustee", [{ name: "Q. Public" }]),
    ]);
    const result = await explainMyBallot(db, stubBallotResolver(snapshot));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.insufficientDataCount).toBe(1);
    expect(result.contests[0]?.insufficientData).toBe(true);
  });

  it("persists the rendered explanation for audit", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "housing", stance: "support", weight: 3 },
    ]);
    const snapshot = baseSnapshot([measureContest("Housing Measure")]);
    await explainMyBallot(db, stubBallotResolver(snapshot));
    const row = db
      .prepare(
        `SELECT election_day, stance_snapshot_hash, source_adapter_id, source_tier
           FROM ballot_explanations ORDER BY id DESC LIMIT 1`,
      )
      .get() as
      | {
          election_day: string | null;
          stance_snapshot_hash: string;
          source_adapter_id: string;
          source_tier: number;
        }
      | undefined;
    expect(row).toBeDefined();
    expect(row?.election_day).toBe("2026-11-03");
    expect(row?.source_adapter_id).toBe("googleCivic");
    expect(row?.source_tier).toBe(2);
    expect(row?.stance_snapshot_hash.length).toBeGreaterThan(0);
  });
});

describe("explainMyBallot — web-search bio enrichment", () => {
  it("attaches tier-promoted bio rows when the web-search resolver is wired", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "climate", stance: "support", weight: 3 },
    ]);
    const snapshot = baseSnapshot([
      candidateContest("U.S. Representative, CA-12", [
        { name: "Alex Example", party: "Democratic" },
      ]),
    ]);

    const observedQueries: BioLookupQuery[] = [];
    const webSearch: WebSearchResolver = {
      async bio(query) {
        observedQueries.push(query);
        const payload: BioPayload = {
          category: "candidate.bio",
          narrativeText: "Former city council member.",
          citations: [
            { url: "https://house.gov/example", retrievedAt: 1 },
            { url: "https://ballotpedia.org/Example", retrievedAt: 2 },
          ],
        };
        return {
          status: "ok",
          adapterId: "webSearch.bios",
          tier: 2,
          data: payload,
          fetchedAt: 123,
        };
      },
    };

    const result = await explainMyBallot(db, stubBallotResolver(snapshot), {
      webSearch,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const contest = result.contests[0]!;
    expect(contest.candidateBios).toHaveLength(1);
    expect(contest.candidateBios[0]?.candidateName).toBe("Alex Example");
    expect(contest.candidateBios[0]?.source.tier).toBe(2);
    expect(observedQueries[0]?.category).toBe("candidate.bio");
  });

  it("degrades silently when the web-search resolver returns unavailable", async () => {
    const db = openMemoryDb();
    seedPrefsAndStances(db, [
      { issue: "climate", stance: "support", weight: 3 },
    ]);
    const snapshot = baseSnapshot([
      candidateContest("U.S. Representative, CA-12", [{ name: "A. Example" }]),
    ]);
    const webSearch: WebSearchResolver = {
      async bio() {
        return {
          status: "unavailable",
          adapterId: "webSearch.bios",
          reason: "no live transport wired",
        };
      },
    };
    const result = await explainMyBallot(db, stubBallotResolver(snapshot), {
      webSearch,
    });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.contests[0]?.candidateBios).toHaveLength(0);
  });
});
