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

  it("routes specific foreign-conflict mentions to regional slugs, not defense-spending", () => {
    const cases: Array<[string, string]> = [
      ["war in Iran", "middle-east-policy"],
      ["Israel and Gaza", "middle-east-policy"],
      ["Iranian nuclear program", "middle-east-policy"],
      ["Saudi Arabia arms sales", "middle-east-policy"],
      ["Russia's invasion of Ukraine", "ukraine-russia-policy"],
      ["Ukraine aid package", "ukraine-russia-policy"],
      ["tensions with China over Taiwan", "china-policy"],
      ["TikTok ban", "china-policy"],
      ["tariffs on China", "trade-policy"],
      ["NATO expansion", "foreign-policy"],
      ["foreign aid", "foreign-policy"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("maps newer policy domains to dedicated slugs", () => {
    const cases: Array<[string, string]> = [
      ["AI regulation", "tech-regulation"],
      ["antitrust action against Big Tech", "tech-regulation"],
      ["bitcoin and stablecoins", "crypto-policy"],
      ["marijuana legalization", "drug-policy"],
      ["the opioid crisis", "drug-policy"],
      ["LGBTQ rights", "lgbtq-rights"],
      ["trans rights", "lgbtq-rights"],
      ["social security benefits", "social-security"],
      ["veterans affairs", "veterans-affairs"],
      ["mass surveillance under FISA", "privacy-rights"],
      ["tariffs on imports", "trade-policy"],
      ["offshore drilling", "energy-policy"],
      ["nuclear energy", "energy-policy"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("flags novel issues with matchedCanonical=false but still returns a usable slug", () => {
    const out = normalizeFreeformIssue("Antarctic territorial claims");
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

  it("does not collapse bare 'war' into defense-spending", () => {
    const out = normalizeFreeformIssue("war is bad");
    expect(out?.matchedCanonical).toBe(false);
  });

  it("exposes the canonical slug set", () => {
    const slugs = canonicalIssueSlugs();
    expect(slugs).toContain("climate");
    expect(slugs).toContain("affordable-housing");
    expect(slugs).toContain("middle-east-policy");
    expect(slugs).toContain("tech-regulation");
    expect(slugs.length).toBeGreaterThanOrEqual(20);
  });
});
