import { describe, expect, it, vi } from "vitest";
import { createHouseVotesResolver } from "./index.js";

describe("createHouseVotesResolver", () => {
  it("surfaces zero-key unavailable when no apiDataGov key is configured", async () => {
    const resolver = createHouseVotesResolver();

    const listResult = await resolver.list({ congress: 119, session: 1 });
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
    expect(resolver.adapterIds()).toEqual([]);
  });

  it("routes calls through the congressGov adapter when the key is present", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ houseRollCallVotes: [] }),
      }) as unknown as Response,
    );
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await resolver.list({ congress: 119, session: 1, limit: 5 });

    expect(result.status).toBe("ok");
    expect(resolver.adapterIds()).toEqual(["congressGov.houseVotes"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("aggregates adapter failures into a single actionable unavailable", async () => {
    const fetcher = vi.fn(async () =>
      ({
        ok: false,
        status: 500,
        json: async () => ({}),
      }) as unknown as Response,
    );
    const resolver = createHouseVotesResolver({ apiDataGovKey: "k", fetcher });

    const result = await resolver.list({ congress: 119, session: 1 });

    expect(result.status).toBe("unavailable");
    if (result.status !== "unavailable") return;
    expect(result.reason).toContain("congressGov.houseVotes");
    expect(result.actionable).toContain("apiDataGov");
  });
});
