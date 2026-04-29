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
  listIssueStances,
} from "../domain/preferences/index.js";
import {
  getOnboardingCheckpoint,
  setOnboardingCheckpoint,
} from "../domain/onboarding/checkpoint.js";
import type { IdentifyResult } from "../domain/reps/index.js";
import { createConfigureTool, type ConfigureResult } from "./configure.js";
import type { ApiKeyName, SetApiKeysResult } from "./setApiKeys.js";

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
  let kv: Kv;

  beforeEach(() => {
    resetStorageConfigForTests();
    resetGatewayCronAdapterForTests();
    const db = openMemoryDb();
    kv = new Kv(db);
    setStorageForTests({ db, kv });
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
      expect(getOnboardingCheckpoint(kv)?.stage).toBe("address");
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

    it("normalizes free-text issue labels to canonical slugs before saving", async () => {
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
          issueStances: [
            { issue: "war in Iran", stance: "oppose", weight: 5 },
            { issue: "AI regulation", stance: "support" },
            { issue: "Antarctic / Arctic claims", stance: "neutral" },
          ],
        },
        undefined,
        undefined,
      );

      const { db } = (await import("../storage/context.js")).getStorage();
      const stances = listIssueStances(db);
      const issues = stances.map((s) => s.issue);
      expect(issues).toContain("middle-east-policy");
      expect(issues).toContain("science-technology-communications");
      // Novel-issue path: punctuation should be stripped, not preserved.
      expect(issues).toContain("antarctic-arctic-claims");
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
    it("does not reconcile cron when only issue stances change during completion", async () => {
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

      const res = await tool.execute!(
        "call-2",
        { issueStances: [{ issue: "housing", stance: "support", weight: 4 }] },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
      expect(details.savedThisCall.stancesAdded).toBe(1);
      expect(reconcileMonitoring).toHaveBeenCalledOnce();
    });

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

      // First call: with missing key, configure stops at the api_key notice.
      const noticeRes = await tool.execute!(
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
      const noticeDetails = detailsFrom<ConfigureResult>(
        noticeRes as { details: ConfigureResult },
      );
      expect(noticeDetails.stage).toBe("api_key");

      // Second call: notice KV flag is set, so we transition to complete even
      // though the key is still missing.
      const res = await tool.execute!("call-2", {}, undefined, undefined);
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

  describe("api_key stage", () => {
    it("prompts for api.data.gov key once when it is missing", async () => {
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
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("api_key");
      if (details.stage !== "api_key") throw new Error("type narrowing");
      expect(details.signupUrl).toBe("https://api.data.gov/signup/");
      expect(details.configPath).toBe("plugins.entries.politiclaw.config.apiKeys.apiDataGov");
      const text = textFrom(res as { content: Array<{ type: string; text: string }> });
      expect(text).toContain("api.data.gov");
      expect(text).toContain("https://api.data.gov/signup/");
      expect(text).toContain("apiDataGov");
    });

    it("does not re-prompt once the notice has been shown", async () => {
      setPluginConfigForTests({ apiKeys: {} });
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
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );

      const res = await tool.execute!("call-2", {}, undefined, undefined);
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
    });

    it("skips the api_key stage when the key is already configured", async () => {
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
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      expect(details.stage).toBe("complete");
    });

    it("prepends resume text from a checkpoint and clears it on complete", async () => {
      setOnboardingCheckpoint(kv, {
        stage: "api_key",
        reason: "api_keys_restart",
        savedKeys: ["apiDataGov"],
        lastPromptSummary: "resume setup after the gateway restarts",
      });
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
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const text = textFrom(res as { content: Array<{ type: string; text: string }> });
      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });

      expect(details.stage).toBe("complete");
      expect(details.resume?.message).toContain("Resuming setup");
      expect(text).toContain("Resuming setup");
      expect(getOnboardingCheckpoint(kv)).toBeNull();
    });
  });

  describe("monitoring stage labels", () => {
    it("renders human-readable monitoring labels and explainers", async () => {
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
        },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(res as { details: ConfigureResult });
      if (details.stage !== "monitoring") throw new Error("type narrowing");
      expect(details.options.map((o) => o.humanLabel)).toEqual([
        "Paused",
        "Quiet watch",
        "Weekly digest",
        "Action only",
        "Full copilot",
      ]);
      const text = textFrom(res as { content: Array<{ type: string; text: string }> });
      expect(text).toContain("**Weekly digest**");
      expect(text).toContain("**Quiet watch**");
    });
  });

  describe("api-keys saved flow", () => {
    function fakeSetApiKeys(opts: {
      result?: Partial<SetApiKeysResult>;
    } = {}) {
      const calls: Array<Partial<Record<ApiKeyName, string>>> = [];
      const fn = vi.fn(async (keys: Partial<Record<ApiKeyName, string>>) => {
        calls.push(keys);
        const saved = Object.keys(keys) as ApiKeyName[];
        const merged: SetApiKeysResult = {
          status: "ok",
          savedKeys: saved,
          skippedKeys: [],
          noop: false,
          restartScheduled: true,
          restartDelayMs: 1500,
          configPath: "/test/openclaw.json",
          ...(opts.result as Partial<SetApiKeysResult> | undefined),
        } as SetApiKeysResult;
        return merged;
      });
      return { fn, calls };
    }

    it("forwards a supplied apiDataGov to setApiKeys and short-circuits to api_keys_saved", async () => {
      const { fn, calls } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        { apiDataGov: "the-key" },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      expect(details.stage).toBe("api_keys_saved");
      if (details.stage !== "api_keys_saved") throw new Error("type narrowing");
      expect(calls).toEqual([{ apiDataGov: "the-key" }]);
      expect(details.setResult.savedKeys).toEqual(["apiDataGov"]);
      const text = textFrom(
        res as { content: Array<{ type: string; text: string }> },
      );
      expect(text).toContain("Saved: apiDataGov");
      expect(text).toContain("restart");
    });

    it("stores an API-key restart checkpoint before saving keys", async () => {
      const { fn } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "123 Main St",
          state: "CA",
          issueStances: [{ issue: "climate", stance: "support" }],
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
          apiDataGov: "the-key",
        },
        undefined,
        undefined,
      );

      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );
      const checkpoint = getOnboardingCheckpoint(kv);
      expect(details.stage).toBe("api_keys_saved");
      expect(checkpoint?.reason).toBe("api_keys_restart");
      expect(checkpoint?.stage).toBe("complete");
      expect(checkpoint?.savedKeys).toEqual(["apiDataGov"]);
    });

    it("merges optional keys into a single setApiKeys call", async () => {
      const { fn, calls } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      await tool.execute!(
        "call-1",
        {
          apiDataGov: "a",
          optionalApiKeys: { geocodio: "g", openStates: "o" },
        },
        undefined,
        undefined,
      );

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        apiDataGov: "a",
        geocodio: "g",
        openStates: "o",
      });
    });

    it("ignores empty/whitespace key strings instead of forwarding them", async () => {
      const { fn, calls } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        {
          apiDataGov: "   ",
          optionalApiKeys: { geocodio: "g", openStates: "" },
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      // Whitespace-only required key is dropped, but an optional key is real,
      // so the call still happens — just with the optional key only.
      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({ geocodio: "g" });
      expect(details.stage).toBe("api_keys_saved");
    });

    it("does not call setApiKeys or change stage when no keys are supplied", async () => {
      setPluginConfigForTests({ apiKeys: {} });
      const { fn } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!("call-1", {}, undefined, undefined);
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      expect(fn).not.toHaveBeenCalled();
      expect(details.stage).toBe("address");
    });

    it("surfaces a setApiKeys error in the prompt instead of writing partial state", async () => {
      const { fn } = fakeSetApiKeys({
        result: {
          status: "error",
          error: "baseHash mismatch",
          savedKeys: [],
          skippedKeys: [],
          noop: false,
          restartScheduled: false,
        } as SetApiKeysResult,
      });
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        { apiDataGov: "the-key" },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      expect(details.stage).toBe("api_keys_saved");
      if (details.stage !== "api_keys_saved") throw new Error("type narrowing");
      expect(details.setResult.status).toBe("error");
      const text = textFrom(
        res as { content: Array<{ type: string; text: string }> },
      );
      expect(text).toContain("baseHash mismatch");
    });

    it("regression: combined onboarding call persists every field even when keys are supplied", async () => {
      // Reviewer caught this: a single politiclaw_configure call with
      // address + stances + monitoring + accountability + apiDataGov was
      // saving the keys but silently dropping the rest. After fix, all
      // four DB/KV writes must happen before the gateway-restart-bound
      // setApiKeys call.
      setPluginConfigForTests({ apiKeys: {} });
      const { fn, calls } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        {
          address: "999 Combined Lane",
          state: "CA",
          zip: "94110",
          issueStances: [
            {
              issue: "climate",
              stance: "support",
              weight: 5,
              note: "BWCA wilderness federal protections",
              sourceText: "I really care about keeping the BWCA protected.",
            },
            { issue: "housing", stance: "oppose" },
          ],
          monitoringMode: "weekly_digest",
          accountability: "nudge_me",
          apiDataGov: "the-key",
        },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      // The keys are still saved.
      expect(calls).toEqual([{ apiDataGov: "the-key" }]);
      expect(details.stage).toBe("api_keys_saved");
      if (details.stage !== "api_keys_saved") throw new Error("type narrowing");

      // The rest of the onboarding fields actually landed in the DB/KV —
      // savedThisCall reports what happened, and the underlying stores
      // confirm it.
      expect(details.savedThisCall).toEqual({
        address: true,
        stancesAdded: 2,
        monitoringChanged: true,
        accountabilityChanged: true,
      });

      const ctx = await import("../storage/context.js");
      const { db, kv } = ctx.getStorage();
      const prefs = getPreferences(db);
      expect(prefs?.address).toBe("999 Combined Lane");
      expect(prefs?.state).toBe("CA");
      expect(prefs?.monitoringMode).toBe("weekly_digest");
      expect(prefs?.accountability).toBe("nudge_me");
      const stances = listIssueStances(db);
      // "housing" normalizes to "housing-and-community-development" via the
      // canonical-synonym map (LoC Policy Area). Both stances landed.
      expect(stances.map((s) => s.issue).sort()).toEqual([
        "climate",
        "housing-and-community-development",
      ]);
      const climate = stances.find((s) => s.issue === "climate");
      expect(climate?.note).toBe("BWCA wilderness federal protections");
      expect(climate?.sourceText).toBe(
        "I really care about keeping the BWCA protected.",
      );
      expect(kv.get(ACCOUNTABILITY_KV_FLAG)).toBeDefined();

      expect(details.preferences?.address).toBe("999 Combined Lane");
    });

    it("saves keys without an address when only keys are supplied (no preferences yet)", async () => {
      setPluginConfigForTests({ apiKeys: {} });
      const { fn } = fakeSetApiKeys();
      const tool = createConfigureTool({
        identifyReps: vi.fn(async () => okReps()),
        createResolver: vi.fn(() => ({}) as never),
        reconcileMonitoring: vi.fn(async () => ({ outcomes: [] })),
        setApiKeys: fn,
      });

      const res = await tool.execute!(
        "call-1",
        { apiDataGov: "k" },
        undefined,
        undefined,
      );
      const details = detailsFrom<ConfigureResult>(
        res as { details: ConfigureResult },
      );

      expect(fn).toHaveBeenCalledOnce();
      expect(details.stage).toBe("api_keys_saved");
      if (details.stage !== "api_keys_saved") throw new Error("type narrowing");
      expect(details.preferences).toBeNull();
      expect(details.savedThisCall).toEqual({
        address: false,
        stancesAdded: 0,
        monitoringChanged: false,
        accountabilityChanged: false,
      });
    });

    it("api_key stage prompt mentions optional keys and paste-into-chat", async () => {
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
          monitoringMode: "weekly_digest",
          accountability: "self_serve",
        },
        undefined,
        undefined,
      );
      const text = textFrom(
        res as { content: Array<{ type: string; text: string }> },
      );

      expect(text).toContain("Paste the key back into chat");
      expect(text).toContain("geocodio");
      expect(text).toContain("openStates");
      expect(text).toContain("googleCivic");
      // Old "edit ~/.openclaw/openclaw.json by hand" instruction is gone.
      expect(text).not.toContain("OpenClaw config under");
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
