import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kv } from "../storage/kv.js";
import { openMemoryDb } from "../storage/sqlite.js";
import type { PolitiClawDb } from "../storage/sqlite.js";
import {
  configureStorage,
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import {
  renderResearchChallengersOutput,
  researchChallengersTool,
} from "./researchChallengers.js";

function seedRep(
  db: PolitiClawDb,
  rep: {
    id: string;
    name: string;
    office: "US House" | "US Senate";
    state: string;
    district?: string;
  },
) {
  db.prepare(
    `INSERT INTO reps (id, name, office, party, state, district, contact,
                       last_synced, source_adapter_id, source_tier)
     VALUES (@id, @name, @office, NULL, @state, @district, NULL,
             @synced, 'test', 1)`,
  ).run({
    id: rep.id,
    name: rep.name,
    office: rep.office,
    state: rep.state,
    district: rep.district ?? null,
    synced: 1_700_000_000_000,
  });
}

describe("renderResearchChallengersOutput", () => {
  it("renders a clear no-reps message", () => {
    const text = renderResearchChallengersOutput({
      status: "no_reps",
      reason: "no representatives stored",
      actionable: "call politiclaw_get_my_reps first",
    });
    expect(text).toContain("politiclaw_get_my_reps");
  });

  it("labels incumbent vs challenger and surfaces per-cycle totals", () => {
    const text = renderResearchChallengersOutput({
      status: "ok",
      cycle: 2026,
      rows: [
        {
          status: "ok",
          race: {
            rep: {
              id: "H0EX01234",
              name: "Jane Incumbent",
              office: "US House",
              state: "CA",
              district: "12",
              lastSynced: 0,
              sourceAdapterId: "test",
              sourceTier: 1,
            },
            race: { office: "H", state: "CA", district: "12", cycle: 2026 },
            status: "ok",
            rows: [
              {
                candidate: {
                  candidateId: "H0EX01234",
                  name: "EXAMPLE, JANE",
                  office: "H",
                  party: "Democratic",
                  state: "CA",
                  district: "12",
                  incumbentChallengeStatus: "Incumbent",
                },
                totals: {
                  candidateId: "H0EX01234",
                  cycle: 2026,
                  receipts: 1_500_000,
                  disbursements: 900_000,
                  cashOnHandEndPeriod: 600_000,
                  individualContributions: 1_000_000,
                  pacContributions: 400_000,
                  candidateSelfFunding: null,
                  independentExpendituresInSupport: null,
                  independentExpendituresInOpposition: null,
                },
                incumbent: true,
              },
              {
                candidate: {
                  candidateId: "H0CH00001",
                  name: "CHALLENGER, BEN",
                  office: "H",
                  party: "Republican",
                  state: "CA",
                  district: "12",
                  incumbentChallengeStatus: "Challenger",
                },
                totals: null,
                incumbent: false,
              },
            ],
          },
        },
      ],
    });
    expect(text).toContain("INCUMBENT — EXAMPLE, JANE");
    expect(text).toContain("$1,500,000");
    expect(text).toContain("challenger — CHALLENGER, BEN");
    expect(text).toContain("no FEC totals available");
    expect(text).toContain("OpenSecrets");
    expect(text).toContain("informational, not independent journalism");
  });

  it("notes when a race has no filings yet", () => {
    const text = renderResearchChallengersOutput({
      status: "ok",
      cycle: 2026,
      rows: [
        {
          status: "ok",
          race: {
            rep: {
              id: "H0NEW0001",
              name: "Freshman Rep",
              office: "US House",
              state: "TX",
              district: "38",
              lastSynced: 0,
              sourceAdapterId: "test",
              sourceTier: 1,
            },
            race: { office: "H", state: "TX", district: "38", cycle: 2026 },
            status: "no_candidates",
            rows: [],
          },
        },
      ],
    });
    expect(text).toContain("No FEC candidates filed for this race yet");
  });
});

describe("politiclaw_research_challengers tool", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    configureStorage(() => "/tmp/politiclaw-challengers-tests");
    setStorageForTests({ db, kv: new Kv(db) });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetStorageConfigForTests();
  });

  it("requires apiDataGov when reps are stored", async () => {
    const db = openMemoryDb();
    configureStorage(() => "/tmp/politiclaw-challengers-tests-2");
    setStorageForTests({ db, kv: new Kv(db) });
    seedRep(db, {
      id: "H0EX01234",
      name: "Jane Incumbent",
      office: "US House",
      state: "CA",
      district: "12",
    });
    setPluginConfigForTests({ apiKeys: {} });

    const result = await researchChallengersTool.execute!("t1", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("api.data.gov");
    expect(text).toContain("apiDataGov");
  });

  it("surfaces no_reps when the reps table is empty", async () => {
    setPluginConfigForTests({ apiKeys: { apiDataGov: "TESTKEY" } });
    const result = await researchChallengersTool.execute!("t2", {}, undefined, undefined);
    const text = (result.content[0] as { type: "text"; text: string }).text;
    expect(text).toContain("politiclaw_get_my_reps");
  });
});
