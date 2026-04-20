import { describe, expect, it } from "vitest";
import {
  assertAllowedForLlmSearch,
  ForbiddenForLlmSearch,
  GuardrailViolation,
  promoteLlmSearchTier,
} from "./guardrails.js";

describe("assertAllowedForLlmSearch", () => {
  it("throws GuardrailViolation for every forbidden category", () => {
    for (const category of Object.values(ForbiddenForLlmSearch)) {
      expect(() => assertAllowedForLlmSearch(category)).toThrow(GuardrailViolation);
    }
  });

  it("includes the category and context in the error message", () => {
    try {
      assertAllowedForLlmSearch(ForbiddenForLlmSearch.VOTE_POSITIONS, "HR-1234");
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(GuardrailViolation);
      const violation = err as GuardrailViolation;
      expect(violation.category).toBe(ForbiddenForLlmSearch.VOTE_POSITIONS);
      expect(violation.message).toContain("VOTE_POSITIONS");
      expect(violation.message).toContain("HR-1234");
    }
  });

  it("does not throw for unknown / allowed categories", () => {
    expect(() => assertAllowedForLlmSearch("CANDIDATE_BIO")).not.toThrow();
    expect(() => assertAllowedForLlmSearch("NARRATIVE_FRAMING")).not.toThrow();
  });
});

describe("promoteLlmSearchTier", () => {
  const tier1 = ["congress.gov", "fec.gov", "sos.ca.gov"];
  const tier2 = ["ballotpedia.org", "votesmart.org"];

  it("stays tier 5 when there are no cited URLs", () => {
    expect(promoteLlmSearchTier([], tier1, tier2)).toBe(5);
  });

  it("returns tier 1 when every cited URL resolves to a primary-government domain", () => {
    const urls = ["https://www.congress.gov/bill/119/hr-1234", "https://fec.gov/foo"];
    expect(promoteLlmSearchTier(urls, tier1, tier2)).toBe(1);
  });

  it("returns tier 2 when all URLs are tier 1 or 2 but not all tier 1", () => {
    const urls = ["https://congress.gov/x", "https://www.ballotpedia.org/y"];
    expect(promoteLlmSearchTier(urls, tier1, tier2)).toBe(2);
  });

  it("stays tier 5 if any URL falls outside the tier-1+2 allow list", () => {
    const urls = ["https://congress.gov/x", "https://example-blog.com/y"];
    expect(promoteLlmSearchTier(urls, tier1, tier2)).toBe(5);
  });

  it("stays tier 5 on malformed URLs", () => {
    expect(promoteLlmSearchTier(["not a url"], tier1, tier2)).toBe(5);
  });
});
