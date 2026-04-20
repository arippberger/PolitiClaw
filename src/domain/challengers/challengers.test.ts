import { describe, expect, it } from "vitest";

import { openMemoryDb } from "../../storage/sqlite.js";
import type {
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
  FinanceResolver,
} from "../../sources/finance/index.js";
import type { AdapterResult } from "../../sources/common/types.js";
import { unavailable } from "../../sources/common/types.js";
import { compareChallengers, defaultCycleFor, raceCoordinatesFor } from "./index.js";

function stubResolver(impl: Partial<FinanceResolver>): FinanceResolver {
  return {
    async searchCandidates() {
      throw new Error("searchCandidates not stubbed");
    },
    async getCandidateSummary() {
      throw new Error("getCandidateSummary not stubbed");
    },
    async getCandidateTotals() {
      throw new Error("getCandidateTotals not stubbed");
    },
    ...impl,
  };
}

function seedRep(
  db: ReturnType<typeof openMemoryDb>,
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

function totals(
  overrides: Partial<FederalCandidateFinancialTotals> & { candidateId: string; cycle: number },
): FederalCandidateFinancialTotals {
  return {
    receipts: null,
    disbursements: null,
    cashOnHandEndPeriod: null,
    individualContributions: null,
    pacContributions: null,
    candidateSelfFunding: null,
    independentExpendituresInSupport: null,
    independentExpendituresInOpposition: null,
    ...overrides,
  };
}

function okResult<T>(data: T): AdapterResult<T> {
  return { status: "ok", adapterId: "fec", tier: 1, data, fetchedAt: 1 };
}

describe("raceCoordinatesFor", () => {
  it("maps House reps with district", () => {
    const coords = raceCoordinatesFor(
      {
        id: "H12345",
        name: "Jane Doe",
        office: "US House",
        state: "ca",
        district: "12",
        lastSynced: 0,
        sourceAdapterId: "test",
        sourceTier: 1,
      },
      2026,
    );
    expect(coords).toEqual({ status: "ok", office: "H", state: "CA", district: "12", cycle: 2026 });
  });

  it("maps Senate reps without district", () => {
    const coords = raceCoordinatesFor(
      {
        id: "S99999",
        name: "Sam Senate",
        office: "US Senate",
        state: "NV",
        lastSynced: 0,
        sourceAdapterId: "test",
        sourceTier: 1,
      },
      2026,
    );
    expect(coords).toEqual({ status: "ok", office: "S", state: "NV", cycle: 2026 });
  });

  it("flags House reps without district as unmappable", () => {
    const coords = raceCoordinatesFor(
      {
        id: "H00000",
        name: "At-Large",
        office: "US House",
        state: "VT",
        lastSynced: 0,
        sourceAdapterId: "test",
        sourceTier: 1,
      },
      2026,
    );
    expect(coords.status).toBe("unmappable");
  });
});

describe("defaultCycleFor", () => {
  it("returns the current year when even", () => {
    expect(defaultCycleFor(new Date("2026-04-19T00:00:00Z"))).toBe(2026);
  });
  it("returns the next even year when odd", () => {
    expect(defaultCycleFor(new Date("2025-07-01T00:00:00Z"))).toBe(2026);
  });
});

describe("compareChallengers", () => {
  it("surfaces no_reps when the reps table is empty", async () => {
    const db = openMemoryDb();
    const resolver = stubResolver({});
    const result = await compareChallengers(db, resolver);
    expect(result.status).toBe("no_reps");
    if (result.status !== "no_reps") return;
    expect(result.actionable).toContain("politiclaw_get_my_reps");
  });

  it("sorts candidates with incumbent first, then by receipts", async () => {
    const db = openMemoryDb();
    seedRep(db, { id: "H0EX01234", name: "EXAMPLE, ALEX", office: "US House", state: "CA", district: "12" });

    const incumbent: FederalCandidateRef = {
      candidateId: "H0EX01234",
      name: "EXAMPLE, ALEX",
      office: "H",
      state: "CA",
      district: "12",
      incumbentChallengeStatus: "Incumbent",
    };
    const richChallenger: FederalCandidateRef = {
      candidateId: "H0CH00001",
      name: "CHALLENGER, BEN",
      office: "H",
      state: "CA",
      district: "12",
      incumbentChallengeStatus: "Challenger",
    };
    const poorChallenger: FederalCandidateRef = {
      candidateId: "H0CH00002",
      name: "CHALLENGER, CASEY",
      office: "H",
      state: "CA",
      district: "12",
      incumbentChallengeStatus: "Challenger",
    };

    const resolver = stubResolver({
      async searchCandidates(filters) {
        expect(filters.office).toBe("H");
        expect(filters.state).toBe("CA");
        expect(filters.district).toBe("12");
        expect(filters.cycle).toBe(2026);
        return okResult([incumbent, poorChallenger, richChallenger]);
      },
      async getCandidateTotals(candidateId, cycle) {
        expect(cycle).toBe(2026);
        if (candidateId === "H0EX01234") {
          return okResult([totals({ candidateId, cycle: 2026, receipts: 800_000 })]);
        }
        if (candidateId === "H0CH00001") {
          return okResult([totals({ candidateId, cycle: 2026, receipts: 1_200_000 })]);
        }
        return okResult([totals({ candidateId, cycle: 2026, receipts: 50_000 })]);
      },
    });

    const result = await compareChallengers(db, resolver, { cycle: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.rows).toHaveLength(1);
    const [first] = result.rows;
    expect(first?.status).toBe("ok");
    if (first?.status !== "ok") return;
    const names = first.race.rows.map((row) => row.candidate.candidateId);
    expect(names).toEqual(["H0EX01234", "H0CH00001", "H0CH00002"]);
    expect(first.race.rows[0]?.incumbent).toBe(true);
    expect(first.race.rows[1]?.incumbent).toBe(false);
  });

  it("degrades a single candidate's totals failure without collapsing the race", async () => {
    const db = openMemoryDb();
    seedRep(db, { id: "S0EX00001", name: "SMITH, SAM", office: "US Senate", state: "NV" });
    const resolver = stubResolver({
      async searchCandidates() {
        return okResult([
          {
            candidateId: "S0EX00001",
            name: "SMITH, SAM",
            office: "S",
            state: "NV",
            incumbentChallengeStatus: "Incumbent",
          },
          {
            candidateId: "S0CH00002",
            name: "JONES, JESSE",
            office: "S",
            state: "NV",
            incumbentChallengeStatus: "Challenger",
          },
        ]);
      },
      async getCandidateTotals(candidateId, cycle) {
        if (candidateId === "S0CH00002") {
          return unavailable("fec", "FEC request failed: HTTP 500");
        }
        return okResult([totals({ candidateId, cycle: cycle ?? 2026, receipts: 2_500_000 })]);
      },
    });
    const result = await compareChallengers(db, resolver, { cycle: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [row] = result.rows;
    expect(row?.status).toBe("ok");
    if (row?.status !== "ok") return;
    expect(row.race.rows).toHaveLength(2);
    expect(row.race.rows[0]?.totals?.receipts).toBe(2_500_000);
    expect(row.race.rows[1]?.totals).toBeNull();
  });

  it("collapses to top-level unavailable when every rep's search fails", async () => {
    const db = openMemoryDb();
    seedRep(db, { id: "H0EX01234", name: "EXAMPLE, ALEX", office: "US House", state: "CA", district: "12" });
    const resolver = stubResolver({
      async searchCandidates() {
        return unavailable("fec", "api.data.gov key is not configured", "set apiDataGov");
      },
    });
    const result = await compareChallengers(db, resolver, { cycle: 2026 });
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.actionable).toContain("apiDataGov");
  });

  it("never substitutes a non-matching cycle's totals for the requested cycle", async () => {
    const db = openMemoryDb();
    seedRep(db, { id: "H0EX01234", name: "EXAMPLE, ALEX", office: "US House", state: "CA", district: "12" });
    const resolver = stubResolver({
      async searchCandidates() {
        return okResult([
          {
            candidateId: "H0EX01234",
            name: "EXAMPLE, ALEX",
            office: "H",
            state: "CA",
            district: "12",
            incumbentChallengeStatus: "Incumbent",
          },
        ]);
      },
      async getCandidateTotals() {
        // FEC returned prior-cycle rows only — 2026 is not filed yet.
        return okResult([
          totals({ candidateId: "H0EX01234", cycle: 2024, receipts: 1_000_000 }),
          totals({ candidateId: "H0EX01234", cycle: 2022, receipts: 800_000 }),
        ]);
      },
    });
    const result = await compareChallengers(db, resolver, { cycle: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [row] = result.rows;
    expect(row?.status).toBe("ok");
    if (row?.status !== "ok") return;
    expect(row.race.rows).toHaveLength(1);
    // Critical: do NOT surface the 2024 row as if it were 2026 data.
    expect(row.race.rows[0]?.totals).toBeNull();
  });

  it("emits no_candidates when a race has zero FEC filings yet", async () => {
    const db = openMemoryDb();
    seedRep(db, { id: "H0NEW0001", name: "NEW, DISTRICT", office: "US House", state: "TX", district: "38" });
    const resolver = stubResolver({
      async searchCandidates() {
        return okResult([]);
      },
    });
    const result = await compareChallengers(db, resolver, { cycle: 2026 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const [row] = result.rows;
    expect(row?.status).toBe("ok");
    if (row?.status !== "ok") return;
    expect(row.race.status).toBe("no_candidates");
    expect(row.race.rows).toEqual([]);
  });
});
