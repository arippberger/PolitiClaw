import { describe, it, expect } from "vitest";
import {
  canonicalIssueSlugs,
  normalizeFreeformIssue,
} from "./normalize.js";

describe("normalizeFreeformIssue", () => {
  it("maps common synonyms to canonical slugs", () => {
    const cases: Array<[string, string]> = [
      ["global warming", "climate"],
      ["I care about guns", "gun-policy"],
      ["abortion access", "reproductive-rights"],
      ["medicare for all", "healthcare"],
      ["student loans are brutal", "education"],
      ["rent is killing me", "affordable-housing"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("flags novel issues with matchedCanonical=false but still returns a usable slug", () => {
    const out = normalizeFreeformIssue("Antitrust enforcement on Big Tech");
    expect(out?.matchedCanonical).toBe(false);
    expect(out?.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it("returns null for empty input", () => {
    expect(normalizeFreeformIssue("")).toBeNull();
    expect(normalizeFreeformIssue("   ")).toBeNull();
  });

  it("does not false-match substrings of longer words", () => {
    const out = normalizeFreeformIssue("information theory");
    expect(out?.matchedCanonical).toBe(false);
  });

  it("exposes the canonical slug set", () => {
    const slugs = canonicalIssueSlugs();
    expect(slugs).toContain("climate");
    expect(slugs).toContain("affordable-housing");
    expect(slugs.length).toBeGreaterThanOrEqual(10);
  });
});
