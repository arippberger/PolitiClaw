import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Kv } from "../storage/kv.js";
import {
  resetStorageConfigForTests,
  setPluginConfigForTests,
  setStorageForTests,
} from "../storage/context.js";
import { openMemoryDb } from "../storage/sqlite.js";
import {
  resetGatewayCronAdapterForTests,
  setGatewayCronAdapterForTests,
  type GatewayCronAdapter,
} from "../cron/gatewayAdapter.js";
import {
  ACCOUNTABILITY_KV_FLAG,
  getPreferences,
} from "../domain/preferences/index.js";
import type { IdentifyResult } from "../domain/reps/index.js";
import { createConfigureTool, type ConfigureResult } from "./configure.js";

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

function emptyCronAdapter(): GatewayCronAdapter {
  return {
    async list() {
      return [];
    },
    async add(input) {
      return {
        id: "noop",
        name: input.name,
        description: input.description,
        enabled: input.enabled ?? true,
        schedule: input.schedule,
        sessionTarget: input.sessionTarget,
        wakeMode: input.wakeMode,
        payload: input.payload,
        delivery: input.delivery,
      };
    },
    async update(id, patch) {
      return {
        id,
        name: patch.name ?? "noop",
        description: patch.description,
        enabled: patch.enabled ?? true,
        schedule: patch.schedule ?? { kind: "every", everyMs: 1 },
        sessionTarget: patch.sessionTarget ?? "isolated",
        wakeMode: patch.wakeMode ?? "next-heartbeat",
        payload: patch.payload ?? { kind: "agentTurn", message: "" },
        delivery: patch.delivery,
      };
    },
  };
}

describe("politiclaw_configure", () => {
  beforeEach(() => {
    resetStorageConfigForTests();
    resetGatewayCronAdapterForTests();
    const db = openMemoryDb();
    setStorageForTests({ db, kv: new Kv(db) });
    setPluginConfigForTests({ apiKeys: { apiDataGov: "test-key" } });
    setGatewayCronAdapterForTests(emptyCronAdapter());
  });

  afterEach(() => {
    resetStorageConfigForTests();
    resetGatewayCronAdapterForTests();
    setPluginConfigForTests(null);
  });

  describe("address stage", () => {
    it("asks for an address when nothing is configured", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!("call-1", {}, undefined, undefined);
      const text = textFrom(res as { content: Array<{ type: string; text: string }> });
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });

      expect(details.stage).toBe("address");
      expect(details.savedThisCall).toEqual({
        address: false,
        stancesAdded: 0,
        monitoringChanged: false,
        accountabilityChanged: false,
      });
      expect(text).toContain("needs your street address");
    });

    it("saves address inline and advances to issues", async () => {
      const identifyReps = vi.fn(async () => okReps());
      const tool = createConfigureTool({
        identifyReps,
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        { address: "123 Main St", state: "ca", zip: "94110", issueMode: "conversation" },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("issues");
      if (details.stage !== "issues") throw new Error("type narrowing");
      expect(details.preferences.address).toBe("123 Main St");
      expect(details.preferences.state).toBe("CA");
      expect(details.savedThisCall.address).toBe(true);
      expect(details.issueSetup.mode).toBe("conversation");
      expect(identifyReps).toHaveBeenCalledOnce();
    });
  });

  describe("issues stage", () => {
    it("returns the conversation/quiz handoff when stances are empty", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        { address: "123 Main St", state: "CA" },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("issues");
      if (details.stage !== "issues") throw new Error("type narrowing");
      expect(details.issueSetup.mode).toBe("choice");
    });

    it("accepts inline issueStances and advances to monitoring", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "Climate", stance: "support", weight: 5 }],
        },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("monitoring");
      if (details.stage !== "monitoring") throw new Error("type narrowing");
      expect(details.savedThisCall.stancesAdded).toBe(1);
      expect(details.currentMonitoringMode).toBe("action_only");
      expect(details.options.map((o) => o.label)).toEqual([
        "off",
        "quiet_watch",
        "weekly_digest",
        "action_only",
        "full_copilot",
      ]);
    });
  });

  describe("monitoring stage", () => {
    it("persists monitoringMode and advances to accountability", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "full_copilot",
        },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("accountability");
      if (details.stage !== "accountability") throw new Error("type narrowing");
      expect(details.preferences.monitoringMode).toBe("full_copilot");
      expect(details.currentMonitoringMode).toBe("full_copilot");
      expect(details.savedThisCall.monitoringChanged).toBe(true);
    });
  });

  describe("accountability stage", () => {
    it("persists accountability and transitions to complete", async () => {
      const reconcileMonitoring = vi.fn(async () => ({ outcomes: [] }));
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring,
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "weekly_digest",
          accountability: "draft_for_me",
        },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
      if (details.stage !== "complete") throw new Error("type narrowing");
      expect(details.preferences.accountability).toBe("draft_for_me");
      expect(details.savedThisCall.accountabilityChanged).toBe(true);
      expect(details.monitoringContract.accountability.mode).toBe("draft_for_me");
      expect(details.monitoringContract.monitoring.mode).toBe("weekly_digest");
      expect(reconcileMonitoring).toHaveBeenCalledOnce();
      expect(reconcileMonitoring).toHaveBeenCalledWith({ mode: "weekly_digest" });
    });

    it("backfills accountability default of 'self_serve' for existing rows", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });
      await tool.execute!(
        "call-1",
        { address: "123 Main St", state: "CA" },
        undefined,
        undefined,
      );
      const { db } = (await import("../storage/context.js")).getStorage();
      const prefs = getPreferences(db);
      expect(prefs?.accountability).toBe("self_serve");
    });
  });

  describe("complete stage", () => {
    it("does not reconcile cron when called with no args after setup is done", async () => {
      const reconcileMonitoring = vi.fn(async () => ({ outcomes: [] }));
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring,
      });

      await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      expect(reconcileMonitoring).toHaveBeenCalledOnce();

      const res = await tool.execute!("call-2", {}, undefined, undefined);
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
      expect(reconcileMonitoring).toHaveBeenCalledOnce();
    });

    it("contract surfaces inactive jobs when api.data.gov key is missing", async () => {
      setPluginConfigForTests({ apiKeys: {} });
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "full_copilot",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
      if (details.stage !== "complete") throw new Error("type narrowing");
      const dataGovInactive = details.monitoringContract.inactiveJobs.filter(
        (j) => j.reason === "missing_api_key",
      );
      expect(dataGovInactive.length).toBeGreaterThan(0);
      expect(dataGovInactive.map((j) => j.name)).toContain(
        "politiclaw.weekly_summary",
      );
    });

    it("contract reports 'off' caveat and zero active jobs", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "off",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      if (details.stage !== "complete") throw new Error("type narrowing");
      expect(details.monitoringContract.monitoring.mode).toBe("off");
      expect(details.monitoringContract.activeJobs).toHaveLength(0);
      expect(details.monitoringContract.caveats.some((c) => c.toLowerCase().includes("off"))).toBe(
        true,
      );
    });

    it("returns the contract block in the prompt text", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support", weight: 5 }],
          monitoringMode: "weekly_digest",
          accountability: "nudge_me",
        },
        undefined,
        undefined,
      );

      const text = textFrom(res as { content: Array<{ type: string; text: string }> });
      expect(text).toContain("Your PolitiClaw monitoring contract");
      expect(text).toContain("climate");
      expect(text).toContain("Monitoring mode: weekly_digest");
      expect(text).toContain("Accountability: Nudge me");
    });
  });

  describe("kv flags", () => {
    it("skips the accountability stage on subsequent calls once the kv flag is set", async () => {
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
      });

      await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "action_only",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );

      const { kv } = (await import("../storage/context.js")).getStorage();
      expect(kv.get(ACCOUNTABILITY_KV_FLAG)).toBeDefined();

      const res = await tool.execute!("call-2", {}, undefined, undefined);
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
    });
  });
});
