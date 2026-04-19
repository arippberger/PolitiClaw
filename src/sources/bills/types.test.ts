import { describe, expect, it } from "vitest";

import { billIdOf, congressGovPublicBillUrl } from "./types.js";

describe("congressGovPublicBillUrl", () => {
  it("builds a house bill URL from a canonical id", () => {
    expect(congressGovPublicBillUrl("119-hr-1234")).toBe(
      "https://www.congress.gov/bill/119/house-bill/1234",
    );
  });

  it("matches billIdOf output", () => {
    const id = billIdOf({ congress: 118, billType: "S", number: "42" });
    expect(congressGovPublicBillUrl(id)).toBe("https://www.congress.gov/bill/118/senate-bill/42");
  });

  it("returns null for unsupported bill types", () => {
    expect(congressGovPublicBillUrl("119-unknown-1")).toBeNull();
  });
});
