/**
 * Thin wrapper around the OpenClaw gateway cron API.
 *
 * All of `setup_monitoring` / `pause_monitoring` / `resume_monitoring`
 * operate by calling these methods. The wrapper exists so tests can inject a
 * fake in-memory implementation without opening a real websocket to the
 * gateway (docs/plan.md Phase 4 — cron is submitted via gateway API, never
 * by editing `jobs.json`, but unit tests must remain hermetic).
 *
 * Test override: call `setGatewayCronAdapterForTests(adapter)` from a test
 * setup block. Reset with `resetGatewayCronAdapterForTests()`. Production
 * code always goes through the callGatewayTool-backed implementation.
 */

import { callGatewayTool } from "openclaw/plugin-sdk/agent-harness";

export type CronJobSchedule =
  | { kind: "every"; everyMs: number; anchorMs?: number }
  | { kind: "at"; at: string }
  | { kind: "cron"; expr: string; tz?: string; staggerMs?: number };

export type CronJobPayload = {
  kind: "agentTurn";
  message: string;
};

export type CronJobDelivery = {
  mode: "announce" | "webhook" | "none";
  channel?: string;
  to?: string;
};

/**
 * Subset of the openclaw CronJob shape we actually read. The gateway returns
 * richer records; we deliberately narrow to the fields we reason about so a
 * minor gateway schema change doesn't break the plugin at compile time.
 */
export type GatewayCronJob = {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  sessionTarget: "main" | "isolated" | "current" | string;
  wakeMode: "next-heartbeat" | "now";
  payload: CronJobPayload | { kind: "systemEvent"; text: string };
  delivery?: CronJobDelivery;
  createdAtMs?: number;
  updatedAtMs?: number;
};

export type CronAddInput = {
  name: string;
  description?: string;
  enabled?: boolean;
  schedule: CronJobSchedule;
  sessionTarget: "main" | "isolated" | "current" | string;
  wakeMode: "next-heartbeat" | "now";
  payload: CronJobPayload;
  delivery?: CronJobDelivery;
};

export type CronUpdatePatch = Partial<{
  name: string;
  description: string;
  enabled: boolean;
  schedule: CronJobSchedule;
  sessionTarget: "main" | "isolated" | "current" | string;
  wakeMode: "next-heartbeat" | "now";
  payload: CronJobPayload;
  delivery: CronJobDelivery;
}>;

export type GatewayCronAdapter = {
  list(opts?: { includeDisabled?: boolean }): Promise<GatewayCronJob[]>;
  add(job: CronAddInput): Promise<GatewayCronJob>;
  update(id: string, patch: CronUpdatePatch): Promise<GatewayCronJob>;
};

type CronListPageResponse = {
  jobs?: GatewayCronJob[];
};

const realGatewayCronAdapter: GatewayCronAdapter = {
  async list(opts) {
    const response = await callGatewayTool<CronListPageResponse>(
      "cron.list",
      {},
      { includeDisabled: Boolean(opts?.includeDisabled) },
    );
    return Array.isArray(response?.jobs) ? response.jobs : [];
  },
  async add(job) {
    return callGatewayTool<GatewayCronJob>("cron.add", {}, job);
  },
  async update(id, patch) {
    return callGatewayTool<GatewayCronJob>("cron.update", {}, { id, patch });
  },
};

let activeAdapter: GatewayCronAdapter = realGatewayCronAdapter;

export function getGatewayCronAdapter(): GatewayCronAdapter {
  return activeAdapter;
}

export function setGatewayCronAdapterForTests(
  adapter: GatewayCronAdapter | null,
): void {
  activeAdapter = adapter ?? realGatewayCronAdapter;
}

export function resetGatewayCronAdapterForTests(): void {
  activeAdapter = realGatewayCronAdapter;
}
