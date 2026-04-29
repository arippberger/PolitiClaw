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
      ["medicare for all", "health"],
      ["student loans are brutal", "education"],
      ["rent control", "affordable-housing"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("routes 'environment' to environmental-protection, not climate", () => {
    const cases: Array<[string, string]> = [
      ["I care about environmental issues", "environmental-protection"],
      ["pollution from local plants", "environmental-protection"],
      ["EPA enforcement", "environmental-protection"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("routes BWCA / public lands mentions to public-lands-and-natural-resources", () => {
    const cases: Array<[string, string]> = [
      ["BWCA federal protections", "public-lands-and-natural-resources"],
      ["national parks funding", "public-lands-and-natural-resources"],
      ["wilderness designation", "public-lands-and-natural-resources"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("routes specific foreign-conflict mentions to regional slugs, not the broad LoC bucket", () => {
    const cases: Array<[string, string]> = [
      ["war in Iran", "middle-east-policy"],
      ["Israel and Gaza", "middle-east-policy"],
      ["Iranian nuclear program", "middle-east-policy"],
      ["Saudi Arabia arms sales", "middle-east-policy"],
      ["Russia's invasion of Ukraine", "ukraine-russia-policy"],
      ["Ukraine aid package", "ukraine-russia-policy"],
      ["tensions with China over Taiwan", "china-policy"],
      ["TikTok ban", "china-policy"],
      ["tariffs on China", "china-policy"],
      ["NATO expansion", "international-affairs"],
      ["foreign aid", "international-affairs"],
    ];
    for (const [input, expected] of cases) {
      const out = normalizeFreeformIssue(input);
      expect(out?.slug, input).toBe(expected);
      expect(out?.matchedCanonical, input).toBe(true);
    }
  });

  it("maps newer policy domains to dedicated slugs", () => {
    const cases: Array<[string, string]> = [
      ["AI regulation", "science-technology-communications"],
      ["antitrust action against Big Tech", "science-technology-communications"],
      ["bitcoin and stablecoins", "crypto-policy"],
      ["marijuana legalization", "drug-policy"],
      ["the opioid crisis", "drug-policy"],
      ["LGBTQ rights", "lgbtq-rights"],
      ["trans rights", "lgbtq-rights"],
      ["social security benefits", "social-security"],
      ["veterans affairs", "veterans-affairs"],
      ["mass surveillance under FISA", "privacy-rights"],
      ["tariffs on imports", "foreign-trade-and-international-finance"],
      ["offshore drilling", "energy"],
      ["nuclear energy", "energy"],
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

  it("does not collapse bare 'war' into armed-forces-and-national-security", () => {
    const out = normalizeFreeformIssue("war is bad");
    expect(out?.matchedCanonical).toBe(false);
  });

  it("exposes the canonical slug set", () => {
    const slugs = canonicalIssueSlugs();
    expect(slugs).toContain("climate");
    expect(slugs).toContain("affordable-housing");
    expect(slugs).toContain("middle-east-policy");
    expect(slugs).toContain("public-lands-and-natural-resources");
    expect(slugs).toContain("environmental-protection");
    expect(slugs).toContain("taxation");
    expect(slugs).toContain("health");
    expect(slugs.length).toBeGreaterThanOrEqual(30);
  });
});
