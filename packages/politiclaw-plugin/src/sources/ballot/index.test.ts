import { describe, expect, it, vi } from "vitest";

import { createBallotResolver } from "./index.js";
import type { StateSoSBallotAdapter } from "./stateSoS/types.js";
import type { NormalizedBallotSnapshot } from "./types.js";

function fixtureSnapshot(): NormalizedBallotSnapshot {
  return {
    normalizedInput: {
      line1: "1600 Amphitheatre Parkway",
      city: "Mountain View",
      state: "CA",
      zip: "94043",
    },
    election: {
      id: "2000",
      name: "General Election",
      electionDay: "2026-11-03",
      ocdDivisionId: "ocd-division/country:us/state:ca",
    },
    contests: [],
    primaryPolling: null,
    pollingLocationCount: 0,
    registrationUrl: null,
    electionAdministrationUrl: null,
  };
}

describe("createBallotResolver", () => {
  it("prefers state adapter for supported state codes", async () => {
    const stateAdapter: StateSoSBallotAdapter = {
      id: "stateSoS.california",
      stateCode: "CA",
      fetchVoterInfo: vi.fn(async () => ({
        status: "ok",
        adapterId: "stateSoS.california",
        tier: 2,
        data: fixtureSnapshot(),
        fetchedAt: 100,
      })),
    };
    const fetcher = vi.fn();
    const resolver = createBallotResolver({
      fetcher,
      googleCivicApiKey: "fake-google-key",
      stateSoSAdapters: [stateAdapter],
    });

    const result = await resolver.voterInfo("1600 Amphitheatre Parkway, 94043, CA");
    expect(stateAdapter.fetchVoterInfo).toHaveBeenCalledTimes(1);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("stateSoS.california");
  });

  it("falls back to Google Civic when state adapter returns unavailable", async () => {
    const stateAdapter: StateSoSBallotAdapter = {
      id: "stateSoS.california",
      stateCode: "CA",
      fetchVoterInfo: vi.fn(async () => ({
        status: "unavailable",
        adapterId: "stateSoS.california",
        reason: "not wired",
      })),
    };
    const googleFixture = fixtureSnapshot();
    const fetcher = vi.fn(async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          election: googleFixture.election,
          normalizedInput: googleFixture.normalizedInput,
          contests: [],
          pollingLocations: [],
        };
      },
    })) as unknown as typeof fetch;
    const resolver = createBallotResolver({
      fetcher,
      googleCivicApiKey: "fake-google-key",
      stateSoSAdapters: [stateAdapter],
    });

    const result = await resolver.voterInfo("1600 Amphitheatre Parkway, 94043, CA");
    expect(stateAdapter.fetchVoterInfo).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("googleCivic");
  });

  it("returns actionable unavailable when state adapter and Google key are both absent", async () => {
    const stateAdapter: StateSoSBallotAdapter = {
      id: "stateSoS.california",
      stateCode: "CA",
      fetchVoterInfo: vi.fn(async () => ({
        status: "unavailable",
        adapterId: "stateSoS.california",
        reason: "not wired",
      })),
    };
    const resolver = createBallotResolver({
      stateSoSAdapters: [stateAdapter],
    });

    const result = await resolver.voterInfo("1600 Amphitheatre Parkway, 94043, CA");
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("No ballot source is configured for CA");
    expect(result.actionable).toContain("plugins.politiclaw.apiKeys.googleCivic");
  });
});

