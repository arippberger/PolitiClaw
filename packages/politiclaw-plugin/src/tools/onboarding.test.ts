import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import { upsertIssueStance } from "../domain/preferences/index.js";
import { startOnboardingTool } from "./onboarding.js";

function textFrom(result: { content?: Array<{ type: string; text?: string }> }): string {
  const block = result.content?.[0];
  if (!block || block.type !== "text" || !block.text) {
    throw new Error("expected text content");
  }
  return block.text;
}

function detailsFrom<T>(result: { details?: T }): T {
  if (!result.details) throw new Error("expected details");
  return result.details;
}

describe("politiclaw_start_onboarding", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
  });
  afterEach(() => {
    resetStorageConfigForTests();
  });

  it("returns a choice prompt when mode is omitted", async () => {
    const res = await startOnboardingTool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    expect(text).toContain("Conversation");
    expect(text).toContain("Quiz");
    const details = detailsFrom<{ mode: string }>(res as { details: { mode: string } });
    expect(details.mode).toBe("choice");
  });

  it("returns conversation handoff with opening prompts and canonical slugs", async () => {
    const res = await startOnboardingTool.execute!(
      "call-1",
      { mode: "conversation" },
      undefined,
      undefined,
    );
    const details = detailsFrom<{
      mode: string;
      suggestedOpeningPrompts: string[];
      canonicalIssueSlugs: string[];
      existingStances: unknown[];
    }>(res as {
      details: {
        mode: string;
        suggestedOpeningPrompts: string[];
        canonicalIssueSlugs: string[];
        existingStances: unknown[];
      };
    });
    expect(details.mode).toBe("conversation");
    expect(details.suggestedOpeningPrompts.length).toBeGreaterThan(0);
    expect(details.canonicalIssueSlugs).toContain("climate");
    expect(details.existingStances).toEqual([]);
  });

  it("returns quiz handoff with question bank and empty existingStances on first run", async () => {
    const res = await startOnboardingTool.execute!(
      "call-1",
      { mode: "quiz" },
      undefined,
      undefined,
    );
    const details = detailsFrom<{
      mode: string;
      questions: Array<{ id: string; canonicalIssueSlug: string }>;
      existingStances: unknown[];
    }>(res as {
      details: {
        mode: string;
        questions: Array<{ id: string; canonicalIssueSlug: string }>;
        existingStances: unknown[];
      };
    });
    expect(details.mode).toBe("quiz");
    expect(details.questions.length).toBeGreaterThanOrEqual(10);
    expect(details.existingStances).toEqual([]);
  });

  it("round-trips existing stances into the quiz handoff (and skips already-answered ones)", async () => {
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 4 });

    const res = await startOnboardingTool.execute!(
      "call-1",
      { mode: "quiz" },
      undefined,
      undefined,
    );
    const details = detailsFrom<{
      questions: Array<{ canonicalIssueSlug: string }>;
      existingStances: Array<{ issue: string }>;
    }>(res as {
      details: {
        questions: Array<{ canonicalIssueSlug: string }>;
        existingStances: Array<{ issue: string }>;
      };
    });
    expect(details.existingStances.map((s) => s.issue)).toContain("climate");
    expect(details.questions.some((q) => q.canonicalIssueSlug === "climate")).toBe(
      false,
    );
  });

  it("choice-prompt text notes existing stance count when present", async () => {
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
    upsertIssueStance(db, { issue: "climate", stance: "support", weight: 4 });
    upsertIssueStance(db, { issue: "healthcare", stance: "oppose", weight: 2 });

    const res = await startOnboardingTool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    expect(text).toContain("already have 2 declared stance");
  });
});
