import { describe, expect, it } from "vitest";
import type { IssueStance } from "../preferences/types.js";
import {
  CONFIDENCE_FLOOR,
  computeRepAlignment,
  type BillEvidence,
} from "./repAlignment.js";

const housingStance: IssueStance = {
  issue: "affordable-housing",
  stance: "support",
  weight: 4,
};
const climateStance: IssueStance = {
  issue: "climate",
  stance: "support",
  weight: 3,
};

function makeEvidence(overrides: Partial<BillEvidence> = {}): BillEvidence {
  return {
    billId: "119-hr-1",
    issue: "affordable-housing",
    stance: "support",
    stanceWeight: 4,
    relevance: 0.8,
    userDirection: "agree",
    userSignalWeight: 1,
    repPosition: "Yea",
    isProcedural: false,
    voteId: "House-119-1-1",
    ...overrides,
  };
}

describe("computeRepAlignment", () => {
  it("returns insufficient data for every stance when no evidence", () => {
    const result = computeRepAlignment([housingStance, climateStance], [], {
      excludeProcedural: true,
    });
    expect(result.perIssue).toHaveLength(2);
    expect(result.perIssue.every((row) => row.belowConfidenceFloor)).toBe(true);
    expect(result.perIssue.every((row) => row.consideredCount === 0)).toBe(true);
    expect(result.consideredVoteCount).toBe(0);
  });

  it("skips neutral stances entirely", () => {
    const neutral: IssueStance = { issue: "energy", stance: "neutral", weight: 3 };
    const result = computeRepAlignment([housingStance, neutral], [], {
      excludeProcedural: true,
    });
    expect(result.perIssue.map((row) => row.issue)).toEqual(["affordable-housing"]);
  });

  it("counts aligned when rep's position matches the user's signalled direction", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", userDirection: "agree", repPosition: "Yea" }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", userDirection: "disagree", repPosition: "Nay" }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    const issue = result.perIssue[0]!;
    expect(issue.alignedCount).toBe(2);
    expect(issue.conflictedCount).toBe(0);
    expect(issue.alignmentScore).toBe(1);
  });

  it("counts conflicted when rep's position opposes the user's signalled direction", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", userDirection: "agree", repPosition: "Nay" }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", userDirection: "disagree", repPosition: "Yea" }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    const issue = result.perIssue[0]!;
    expect(issue.alignedCount).toBe(0);
    expect(issue.conflictedCount).toBe(2);
    expect(issue.alignmentScore).toBe(0);
  });

  it("weights alignment by relevance x stanceWeight x signalWeight", () => {
    const evidence = [
      makeEvidence({
        billId: "119-hr-1",
        voteId: "v1",
        relevance: 1.0,
        stanceWeight: 5,
        userSignalWeight: 2,
        userDirection: "agree",
        repPosition: "Yea",
      }),
      makeEvidence({
        billId: "119-hr-2",
        voteId: "v2",
        relevance: 0.2,
        stanceWeight: 1,
        userSignalWeight: 1,
        userDirection: "agree",
        repPosition: "Nay",
      }),
      makeEvidence({
        billId: "119-hr-3",
        voteId: "v3",
        relevance: 0.5,
        stanceWeight: 4,
        userSignalWeight: 1,
        userDirection: "agree",
        repPosition: "Yea",
      }),
    ];
    const result = computeRepAlignment(
      [{ issue: "affordable-housing", stance: "support", weight: 4 }],
      evidence,
      { excludeProcedural: true },
    );
    const issue = result.perIssue[0]!;
    // aligned weight: 1.0*5*2 + 0.5*4*1 = 12; conflicted weight: 0.2*1*1 = 0.2.
    // alignment score = 12 / 12.2 ≈ 0.984 — heavy matches dominate.
    expect(issue.alignmentScore).toBeGreaterThan(0.95);
    expect(issue.alignedCount).toBe(2);
    expect(issue.conflictedCount).toBe(1);
  });

  it("excludes procedural votes by default (§8)", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", isProcedural: true }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", isProcedural: false }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    expect(result.skippedProceduralCount).toBe(1);
    expect(result.perIssue[0]!.consideredCount).toBe(1);
  });

  it("excludes NULL-classified (is_procedural=null) votes when excludeProcedural=true", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", isProcedural: null }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", isProcedural: false }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    expect(result.skippedProceduralCount).toBe(1);
    expect(result.perIssue[0]!.consideredCount).toBe(1);
  });

  it("includes procedural votes when excludeProcedural=false (opt-in raw tally)", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", isProcedural: true }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", isProcedural: false }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: false,
    });
    expect(result.skippedProceduralCount).toBe(0);
    expect(result.perIssue[0]!.consideredCount).toBe(2);
  });

  it("skips Present / Not Voting positions", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", repPosition: "Present" }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", repPosition: "Not Voting" }),
      makeEvidence({ billId: "119-hr-3", voteId: "v3", repPosition: "Yea" }),
    ];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    expect(result.skippedNeutralPositionCount).toBe(2);
    expect(result.perIssue[0]!.consideredCount).toBe(1);
  });

  it("forces below-floor confidence on a single counted vote (noise guard)", () => {
    const evidence = [makeEvidence({ billId: "119-hr-1", voteId: "v1" })];
    const result = computeRepAlignment([housingStance], evidence, {
      excludeProcedural: true,
    });
    const issue = result.perIssue[0]!;
    expect(issue.consideredCount).toBe(1);
    expect(issue.belowConfidenceFloor).toBe(true);
    expect(issue.confidence).toBeLessThan(CONFIDENCE_FLOOR);
  });

  it("raises confidence with more considered bills and stronger relevance", () => {
    const thinEvidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", relevance: 0.3 }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", relevance: 0.3 }),
    ];
    const richEvidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", relevance: 0.9 }),
      makeEvidence({ billId: "119-hr-2", voteId: "v2", relevance: 0.9 }),
      makeEvidence({ billId: "119-hr-3", voteId: "v3", relevance: 0.8 }),
      makeEvidence({ billId: "119-hr-4", voteId: "v4", relevance: 0.8 }),
      makeEvidence({ billId: "119-hr-5", voteId: "v5", relevance: 0.9 }),
    ];
    const thin = computeRepAlignment([housingStance], thinEvidence, { excludeProcedural: true });
    const rich = computeRepAlignment([housingStance], richEvidence, { excludeProcedural: true });
    expect(rich.perIssue[0]!.confidence).toBeGreaterThan(thin.perIssue[0]!.confidence);
  });

  it("rationale cites specific bill ids for aligned and conflicted votes", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-30", voteId: "v1", userDirection: "agree", repPosition: "Yea" }),
      makeEvidence({ billId: "119-hr-30", voteId: "v1", userDirection: "agree", repPosition: "Yea" }),
      makeEvidence({ billId: "119-hr-1234", voteId: "v2", userDirection: "agree", repPosition: "Nay" }),
      makeEvidence({ billId: "119-hr-1234", voteId: "v2", userDirection: "agree", repPosition: "Nay" }),
    ];
    const result = computeRepAlignment([housingStance], evidence, { excludeProcedural: true });
    const rationale = result.perIssue[0]!.rationale;
    expect(rationale).toContain("119-hr-30");
    expect(rationale).toContain("119-hr-1234");
    expect(rationale).toContain("aligned");
    expect(rationale).toContain("conflicted");
  });

  it("dedupes considered-vote count across issues when the same vote touches multiple issues", () => {
    const evidence = [
      makeEvidence({ billId: "119-hr-1", voteId: "v1", issue: "affordable-housing" }),
      makeEvidence({ billId: "119-hr-1", voteId: "v1", issue: "climate" }),
    ];
    const result = computeRepAlignment(
      [housingStance, climateStance],
      evidence,
      { excludeProcedural: true },
    );
    expect(result.consideredVoteCount).toBe(1);
  });
});
