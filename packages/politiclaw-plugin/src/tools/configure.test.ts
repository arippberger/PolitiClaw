import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import type { IdentifyResult } from "../domain/reps/index.js";
import { createConfigureTool } from "./configure.js";

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

function okReps(): IdentifyResult {
  return {
    status: "ok",
    fromCache: false,
    source: { adapterId: "test-reps", tier: 1 },
    reps: [
      {
        id: "A000360",
        name: "Ada Lovelace",
        office: "US House",
        party: "I",
        state: "CA",
        district: "12",
        lastSynced: 1,
        sourceAdapterId: "test-reps",
        sourceTier: 1,
      },
    ],
  };
}

describe("politiclaw_configure", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
  });

  afterEach(() => {
    resetStorageConfigForTests();
  });

  it("asks for an address when nothing is configured yet", async () => {
    const tool = createConfigureTool({
      identifyReps: vi.fn(async () => okReps()),
      createResolver: vi.fn(() => ({}) as never),
      reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
    });

    const res = await tool.execute!("call-1", {}, undefined, undefined);
    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    const details = detailsFrom<{ status: string; preferences: null }>(res as {
      details: { status: string; preferences: null };
    });

    expect(details).toEqual({ status: "needs_address", preferences: null });
    expect(text).toContain("needs your street address");
  });

  it("saves the address, resolves reps, and returns an issue-setup handoff when stances are missing", async () => {
    const identifyReps = vi.fn(async () => okReps());
    const reconcileMonitoring = vi.fn(async () => ({ outcomes: [] }));
    const tool = createConfigureTool({
      identifyReps,
      createResolver: vi.fn(() => ({}) as never),
      reconcileMonitoring,
    });

    const res = await tool.execute!(
      "call-1",
      {
        address: "123 Main St",
        state: "ca",
        zip: "94110",
        mode: "conversation",
      },
      undefined,
      undefined,
    );

    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    const details = detailsFrom<{
      status: string;
      preferences: { address: string; state: string; zip: string };
      issueSetup: { mode: string };
      reps: IdentifyResult;
    }>(res as {
      details: {
        status: string;
        preferences: { address: string; state: string; zip: string };
        issueSetup: { mode: string };
        reps: IdentifyResult;
      };
    });

    expect(details.status).toBe("needs_issue_setup");
    expect(details.preferences.address).toBe("123 Main St");
    expect(details.preferences.state).toBe("CA");
    expect(details.preferences.zip).toBe("94110");
    expect(details.issueSetup.mode).toBe("conversation");
    expect(details.reps.status).toBe("ok");
    expect(text).toContain("Saved your address");
    expect(text).toContain("Next step: tell me what issues matter to you");
    expect(identifyReps).toHaveBeenCalledOnce();
    expect(reconcileMonitoring).not.toHaveBeenCalled();
  });

  it("finishes configuration and reconciles monitoring once issue stances exist", async () => {
    const reconcileMonitoring = vi.fn(async () => ({
      outcomes: [
        { name: "politiclaw.weekly_summary", jobId: "job-1", action: "created" as const },
      ],
    }));
    const tool = createConfigureTool({
      identifyReps: vi.fn(async () => okReps()),
      createResolver: vi.fn(() => ({}) as never),
      reconcileMonitoring,
    });

    const res = await tool.execute!(
      "call-1",
      {
        address: "123 Main St",
        state: "ca",
        zip: "94110",
        monitoringCadence: "weekly",
        issueStances: [{ issue: "climate", stance: "support", weight: 5 }],
      },
      undefined,
      undefined,
    );

    const text = textFrom(res as { content: Array<{ type: string; text: string }> });
    const details = detailsFrom<{
      status: string;
      cadence: string;
      currentIssueStances: Array<{ issue: string; stance: string; weight: number }>;
    }>(res as {
      details: {
        status: string;
        cadence: string;
        currentIssueStances: Array<{ issue: string; stance: string; weight: number }>;
      };
    });

    expect(details.status).toBe("configured");
    expect(details.cadence).toBe("weekly");
    expect(details.currentIssueStances).toHaveLength(1);
    expect(details.currentIssueStances[0]).toMatchObject({
      issue: "climate",
      stance: "support",
      weight: 5,
    });
    expect(text).toContain("PolitiClaw is configured");
    expect(text).toContain("Monitoring cadence: weekly");
    expect(reconcileMonitoring).toHaveBeenCalledWith({ cadence: "weekly" });
  });
});
