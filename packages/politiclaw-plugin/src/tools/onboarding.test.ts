import { describe, expect, it } from "vitest";

import type { IssueStanceRow } from "../domain/preferences/types.js";
import {
  buildStartOnboardingResult,
  renderChoicePrompt,
  renderStartOnboardingOutput,
} from "./onboarding.js";

function stance(issue: string, weight = 3): IssueStanceRow {
  return {
    issue,
    stance: "support",
    weight,
    updatedAt: 0,
  };
}

describe("buildStartOnboardingResult", () => {
  it("returns a choice prompt when mode is omitted", () => {
    const result = buildStartOnboardingResult({}, []);
    expect(result.mode).toBe("choice");
    const text = renderStartOnboardingOutput(result);
    expect(text).toContain("Conversation");
    expect(text).toContain("Quiz");
  });

  it("returns conversation handoff with opening prompts and canonical slugs", () => {
    const result = buildStartOnboardingResult({ mode: "conversation" }, []);
    expect(result.mode).toBe("conversation");
    if (result.mode !== "conversation") throw new Error("unreachable");
    expect(result.suggestedOpeningPrompts.length).toBeGreaterThan(0);
    expect(result.canonicalIssueSlugs).toContain("climate");
    expect(result.existingStances).toEqual([]);
  });

  it("returns quiz handoff with the full question bank on first run", () => {
    const result = buildStartOnboardingResult({ mode: "quiz" }, []);
    expect(result.mode).toBe("quiz");
    if (result.mode !== "quiz") throw new Error("unreachable");
    expect(result.questions.length).toBeGreaterThanOrEqual(10);
    expect(result.existingStances).toEqual([]);
  });

  it("skips already-answered questions in quiz mode", () => {
    const existing = [stance("climate", 4)];
    const result = buildStartOnboardingResult({ mode: "quiz" }, existing);
    expect(result.mode).toBe("quiz");
    if (result.mode !== "quiz") throw new Error("unreachable");
    expect(result.questions.some((q) => q.canonicalIssueSlug === "climate")).toBe(false);
    expect(result.existingStances.map((s) => s.issue)).toContain("climate");
  });
});

describe("renderChoicePrompt", () => {
  it("notes existing stance count when present", () => {
    const text = renderChoicePrompt([stance("climate", 4), stance("healthcare", 2)]);
    expect(text).toContain("already have 2 declared stance");
  });

  it("omits the existing-stance footer when empty", () => {
    const text = renderChoicePrompt([]);
    expect(text).not.toContain("already have");
  });
});
