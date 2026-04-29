import { describe, expect, it } from "vitest";
import type { Bill } from "../../sources/bills/types.js";
import type { IssueStance } from "../preferences/types.js";
import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  computeBillAlignment,
} from "./alignment.js";

const housingBill: Bill = {
  id: "119-hr-1234",
  congress: 119,
  billType: "HR",
  number: "1234",
  title: "Clean Housing Investment Act of 2026",
  policyArea: "Housing and Community Development",
  subjects: ["Affordable housing", "Housing finance and home ownership"],
  summaryText: "Authorizes grants to states for expanding affordable housing stock.",
  originChamber: "House",
};

const sparseBill: Bill = {
  id: "119-hr-9999",
  congress: 119,
  billType: "HR",
  number: "9999",
  title: "An Act to do something",
};

describe("computeBillAlignment", () => {
  it("matches the strongest location (policyArea > subject > title > summary)", () => {
    const result = computeBillAlignment(housingBill, [
      { issue: "affordable-housing", stance: "support", weight: 4 },
    ]);
    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]!.location).toBe("policyArea");
    expect(result.relevance).toBeGreaterThan(0);
  });

  it("falls back to subject keywords when policyArea misses", () => {
    const bill = { ...housingBill, policyArea: "Taxation" };
    const result = computeBillAlignment(bill, [
      { issue: "affordable-housing", stance: "support", weight: 4 },
    ]);
    expect(result.matches[0]!.location).toBe("subject");
    expect(result.matches[0]!.matchedText).toContain("Affordable housing");
  });

  it("skips neutral stances entirely", () => {
    const result = computeBillAlignment(housingBill, [
      { issue: "climate", stance: "neutral", weight: 5 },
      { issue: "housing", stance: "support", weight: 2 },
    ]);
    const matchedIssues = result.matches.map((match) => match.issue);
    expect(matchedIssues).toEqual(["housing"]);
  });

  it("emits a rationale that names the matched issues and locations", () => {
    const result = computeBillAlignment(housingBill, [
      { issue: "housing", stance: "support", weight: 3 },
    ]);
    expect(result.rationale).toContain("housing");
    expect(result.rationale).toContain("policy area");
    expect(result.rationale).toContain("119 HR 1234");
  });

  it("reports zero matches with a neutral rationale when nothing hits", () => {
    const result = computeBillAlignment(housingBill, [
      { issue: "defense", stance: "oppose", weight: 5 },
    ]);
    expect(result.matches).toHaveLength(0);
    expect(result.relevance).toBe(0);
    expect(result.rationale).toContain("No declared stance keywords matched");
  });

  it("clamps relevance into [0, 1]", () => {
    const result = computeBillAlignment(housingBill, [
      { issue: "housing", stance: "support", weight: 5 },
      { issue: "affordable-housing", stance: "support", weight: 5 },
    ]);
    expect(result.relevance).toBeGreaterThan(0);
    expect(result.relevance).toBeLessThanOrEqual(1);
  });

  it("falls below the confidence floor when the bill has no subjects or summary", () => {
    const result = computeBillAlignment(sparseBill, [
      { issue: "housing", stance: "support", weight: 3 },
    ]);
    expect(result.confidence).toBeLessThan(CONFIDENCE_FLOOR);
    expect(result.belowConfidenceFloor).toBe(true);
  });

  it("rises above the confidence floor for a rich bill + multiple stances", () => {
    const stances: IssueStance[] = [
      { issue: "housing", stance: "support", weight: 4 },
      { issue: "climate", stance: "support", weight: 3 },
      { issue: "taxation", stance: "oppose", weight: 2 },
    ];
    const result = computeBillAlignment(housingBill, stances);
    expect(result.confidence).toBeGreaterThanOrEqual(CONFIDENCE_FLOOR);
    expect(result.belowConfidenceFloor).toBe(false);
  });

  it("produces a stable stanceSnapshotHash regardless of input order", () => {
    const a = computeBillAlignment(housingBill, [
      { issue: "housing", stance: "support", weight: 3 },
      { issue: "climate", stance: "oppose", weight: 5 },
    ]);
    const b = computeBillAlignment(housingBill, [
      { issue: "climate", stance: "oppose", weight: 5 },
      { issue: "housing", stance: "support", weight: 3 },
    ]);
    expect(a.stanceSnapshotHash).toBe(b.stanceSnapshotHash);
  });

  it("exposes the alignment disclaimer as an exported constant", () => {
    expect(ALIGNMENT_DISCLAIMER).toContain("informational");
    expect(ALIGNMENT_DISCLAIMER).toContain("verify");
    expect(ALIGNMENT_DISCLAIMER).toContain("Directional framing");
  });
});
