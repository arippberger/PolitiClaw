import { describe, expect, it, vi } from "vitest";
import { createVotesResolver } from "./index.js";

describe("createVotesResolver", () => {
  it("surfaces zero-key unavailable for House when no apiDataGov key is configured", async () => {
    const resolver = createVotesResolver();

    const listResult = await resolver.list({
      chamber: "House",
      congress: 119,
      session: 1,
    });
    const detailResult = await resolver.getWithMembers({
      chamber: "House",
      congress: 119,
      session: 1,
      rollCallNumber: 1,
    });

    expect(listResult.status).toBe("unavailable");
    if (listResult.status !== "unavailable") return;
    expect(listResult.reason).toContain("no house-votes source configured");
    expect(listResult.actionable).toContain("apiDataGov");

    expect(detailResult.status).toBe("unavailable");
    // Senate adapter is configured zero-key; House is missing without apiDataGov.
    expect(resolver.adapterIds()).toEqual(["voteview.senateVotes"]);
  });

  it("routes House calls through the congressGov adapter when the key is present", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ houseRollCallVotes: [] }),
      }) as unknown as Response,
    );
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await resolver.list({
      chamber: "House",
      congress: 119,
      session: 1,
      limit: 5,
    });

    expect(result.status).toBe("ok");
    expect(resolver.adapterIds()).toContain("congressGov.houseVotes");
    expect(resolver.adapterIds()).toContain("voteview.senateVotes");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("routes Senate calls through the voteview adapter without requiring a key", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ recordcount: 0, recordcountTotal: 0, rollcalls: [] }),
      }) as unknown as Response,
    );
    const resolver = createVotesResolver({ fetcher });

    const result = await resolver.list({
      chamber: "Senate",
      congress: 119,
    });

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    expect(result.adapterId).toBe("voteview.senateVotes");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aggregates House adapter failures into a single actionable unavailable", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }) as unknown as Response,
    );
    const resolver = createVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await resolver.list({
      chamber: "House",
      congress: 119,
      session: 1,
    });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("congressGov.houseVotes");
    expect(result.actionable).toContain("apiDataGov");
  });
});
