import { describe, expect, it } from "vitest";

import { createFinanceResolver } from "./index.js";

describe("finance resolver", () => {
  it("returns unavailable when apiDataGov is not configured", async () => {
    const fetcher: typeof fetch = async () => {
      throw new Error("should not be called");
    };
    const resolver = createFinanceResolver({ fetcher });

    const searchResult = await resolver.searchCandidates({ nameQuery: "Example" });
    expect(searchResult.status).toBe("unavailable");
    if (searchResult.status === "unavailable") {
      expect(searchResult.actionable).toContain("apiDataGov");
    }

    const summaryResult = await resolver.getCandidateSummary("H0EX01234");
    expect(summaryResult.status).toBe("unavailable");
    if (summaryResult.status === "unavailable") {
      expect(summaryResult.reason).toContain("api.data.gov");
    }
  });

  it("delegates to the FEC adapter when a key is configured", async () => {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      calls.push(String(input));
      return new Response(
        JSON.stringify({ results: [], pagination: { count: 0 } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    };
    const resolver = createFinanceResolver({
      apiDataGovKey: "TESTKEY",
      fetcher,
      baseUrl: "https://fec.test/v1",
    });
    await resolver.searchCandidates({ nameQuery: "Example" });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("api_key=TESTKEY");
    expect(calls[0]).toContain("/candidates/search/");
  });
});
