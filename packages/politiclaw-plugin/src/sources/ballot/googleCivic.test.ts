import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createGoogleCivicBallotAdapter,
  normalizeGoogleVoterInfoPayload,
} from "./googleCivic.js";

const FIXTURES_DIR = join(dirname(fileURLToPath(import.meta.url)), "__fixtures__");

describe("normalizeGoogleVoterInfoPayload", () => {
  it("maps contests, polling, and state administration URLs", () => {
    const raw = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "google_voterinfo_ca_2026-04-19.json"), "utf8"),
    );
    const normalized = normalizeGoogleVoterInfoPayload(raw);

    expect(normalized.election?.electionDay).toBe("2026-11-03");
    expect(normalized.contests).toHaveLength(2);
    expect(normalized.contests[0]?.office).toBe("Governor");
    expect(normalized.contests[0]?.candidates).toHaveLength(2);
    expect(normalized.contests[1]?.referendumTitle).toContain("Proposition 99");
    expect(normalized.pollingLocationCount).toBe(1);
    expect(normalized.primaryPolling?.line1).toBe("100 Elm St");
    expect(normalized.registrationUrl).toContain("registertovote.ca.gov");
    expect(normalized.electionAdministrationUrl).toContain("sos.ca.gov");
  });

  it("skips address-less polling rows and keeps count accurate", () => {
    const normalized = normalizeGoogleVoterInfoPayload({
      pollingLocations: [
        { pollingHours: "07:00-20:00" },
        {
          address: { locationName: "Elm Center", line1: "200 Elm", city: "Mountain View", state: "CA", zip: "94043" },
          pollingHours: "07:00-20:00",
        },
      ],
    });

    expect(normalized.pollingLocationCount).toBe(2);
    expect(normalized.primaryPolling?.line1).toBe("200 Elm");
  });

  it("keeps primaryPolling null when every location omits an address", () => {
    const normalized = normalizeGoogleVoterInfoPayload({
      pollingLocations: [{ pollingHours: "07:00-20:00" }, { pollingHours: "07:00-20:00" }],
    });

    expect(normalized.pollingLocationCount).toBe(2);
    expect(normalized.primaryPolling).toBeNull();
  });
});

describe("createGoogleCivicBallotAdapter.fetchVoterInfo", () => {
  it("returns unavailable on HTTP failure", async () => {
    const fetcher = vi.fn(async () => ({
      ok: false,
      status: 403,
      async json() {
        return { error: { message: "Forbidden" } };
      },
    }) as unknown as Response);

    const adapter = createGoogleCivicBallotAdapter({
      apiKey: "test-key",
      fetcher,
    });

    const result = await adapter.fetchVoterInfo("123 Main St");
    expect(result.status).toBe("unavailable");
    if (result.status === "unavailable") {
      expect(result.reason).toContain("Forbidden");
    }
  });

  it("parses successful voterinfo responses", async () => {
    const fixture = JSON.parse(
      readFileSync(join(FIXTURES_DIR, "google_voterinfo_ca_2026-04-19.json"), "utf8"),
    );

    const fetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        async json() {
          return fixture;
        },
      }) as unknown as Response,
    );

    const adapter = createGoogleCivicBallotAdapter({
      apiKey: "test-key",
      fetcher,
      now: () => 999,
    });

    const result = await adapter.fetchVoterInfo("1600 Amphitheatre Parkway");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("googleCivic");
    expect(result.tier).toBe(2);
    expect(result.fetchedAt).toBe(999);
    expect(result.data.contests.length).toBeGreaterThan(0);
  });
});
