import { describe, it, expect } from "vitest";

import {
  BIO_TIER_1_DOMAINS,
  BIO_TIER_2_DOMAINS,
  createBiosAdapter,
} from "./bios.js";
import type {
  BioLookupQuery,
  BioPayload,
  WebSearchFetcher,
} from "./bios.js";
import { GuardrailViolation } from "../common/guardrails.js";

const BASELINE_QUERY: BioLookupQuery = {
  name: "Example Candidate",
  office: "H",
  state: "ca",
  district: "12",
  category: "candidate.bio",
};

function okFetcher(payload: Omit<BioPayload, "category">): WebSearchFetcher {
  return async () => ({ status: "ok", payload });
}

describe("bios adapter — transport + tier promotion", () => {
  it("returns unavailable when no fetcher is wired", async () => {
    const adapter = createBiosAdapter();
    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.adapterId).toBe("webSearch.bios");
    expect(result.reason).toContain("no live web-search transport");
    expect(result.actionable).toContain("WebSearchFetcher");
  });

  it("promotes to tier 1 when every citation is a primary government domain", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "Career facts from official sources.",
        citations: [
          { url: "https://house.gov/example", retrievedAt: 1 },
          { url: "https://www.congress.gov/member/example", retrievedAt: 2 },
        ],
      }),
      now: () => 100,
    });

    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tier).toBe(1);
    expect(result.fetchedAt).toBe(100);
    expect(result.data.narrativeText).toContain("Career facts");
  });

  it("promotes to tier 2 on mixed tier-1 and tier-2 citations", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "Bio drawn from Ballotpedia and the official site.",
        citations: [
          { url: "https://house.gov/example", retrievedAt: 1 },
          { url: "https://ballotpedia.org/Example", retrievedAt: 2 },
        ],
      }),
    });

    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tier).toBe(2);
  });

  it("keeps tier 5 when any citation is outside tier-1/tier-2", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "Mix of official + news.",
        citations: [
          { url: "https://house.gov/example", retrievedAt: 1 },
          { url: "https://example-news.com/article", retrievedAt: 2 },
        ],
      }),
    });

    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tier).toBe(5);
  });

  it("keeps tier 5 when citations list is empty", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "Narrative with no cites — should not be promoted.",
        citations: [],
      }),
    });

    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.tier).toBe(5);
  });

  it("preserves structured narrative fields and citation metadata", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "Prior state legislator.",
        structured: { priorOffice: "California State Senate, 13th district" },
        citations: [
          {
            url: "https://ballotpedia.org/Example_Candidate",
            title: "Example Candidate — Ballotpedia",
            publisher: "Ballotpedia",
            retrievedAt: 1700000000,
          },
        ],
      }),
    });
    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.data.structured?.priorOffice).toContain("California State Senate");
    expect(result.data.citations[0]?.publisher).toBe("Ballotpedia");
  });

  it("forwards fetcher unavailability with actionable hint", async () => {
    const adapter = createBiosAdapter({
      fetcher: async () => ({
        status: "unavailable",
        reason: "rate limited",
        actionable: "retry in 60s",
      }),
    });
    const result = await adapter.fetch(BASELINE_QUERY);
    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toBe("rate limited");
    expect(result.actionable).toBe("retry in 60s");
  });

  it("normalizes state code to uppercase before handing to the fetcher", async () => {
    let observed: BioLookupQuery | null = null;
    const adapter = createBiosAdapter({
      fetcher: async (q) => {
        observed = q;
        return {
          status: "ok",
          payload: { narrativeText: "ok", citations: [] },
        };
      },
    });
    await adapter.fetch({ ...BASELINE_QUERY, state: "ca" });
    expect(observed!.state).toBe("CA");
  });
});

describe("bios adapter — §9 guardrails", () => {
  it("refuses a structured field that encodes a vote position", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "ok",
        structured: { votePositionHR5: "YES" },
        citations: [{ url: "https://house.gov/x", retrievedAt: 1 }],
      }),
    });
    await expect(adapter.fetch(BASELINE_QUERY)).rejects.toBeInstanceOf(
      GuardrailViolation,
    );
  });

  it("refuses a structured field that encodes a dollar amount", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "ok",
        structured: { totalReceipts2024: "2500000" },
        citations: [{ url: "https://house.gov/x", retrievedAt: 1 }],
      }),
    });
    await expect(adapter.fetch(BASELINE_QUERY)).rejects.toBeInstanceOf(
      GuardrailViolation,
    );
  });

  it("refuses a structured field that encodes an election date / polling location", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "ok",
        structured: { pollingLocation: "123 Main St" },
        citations: [{ url: "https://house.gov/x", retrievedAt: 1 }],
      }),
    });
    await expect(adapter.fetch(BASELINE_QUERY)).rejects.toBeInstanceOf(
      GuardrailViolation,
    );
  });

  it("refuses a structured field that implies district assignment", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "ok",
        structured: { districtAssignment: "CA-12" },
        citations: [{ url: "https://house.gov/x", retrievedAt: 1 }],
      }),
    });
    await expect(adapter.fetch(BASELINE_QUERY)).rejects.toBeInstanceOf(
      GuardrailViolation,
    );
  });

  it("refuses an unknown bio-lookup category", async () => {
    const adapter = createBiosAdapter({
      fetcher: okFetcher({
        narrativeText: "ok",
        citations: [{ url: "https://house.gov/x", retrievedAt: 1 }],
      }),
    });
    const bad = { ...BASELINE_QUERY, category: "candidate.voteRecord" as never };
    await expect(adapter.fetch(bad)).rejects.toBeInstanceOf(GuardrailViolation);
  });
});

describe("bios tier domain lists are coherent", () => {
  it("exposes non-empty allowlists so tier-1/tier-2 promotion can fire", () => {
    expect(BIO_TIER_1_DOMAINS.length).toBeGreaterThan(0);
    expect(BIO_TIER_2_DOMAINS.length).toBeGreaterThan(0);
  });
});
