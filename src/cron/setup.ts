/**
 * Orchestrates setup / pause / resume of PolitiClaw's default cron jobs.
 *
 * Design:
 * - Idempotent: re-running `setupMonitoring()` matches existing jobs by their
 *   stable `name` (`politiclaw.weekly_summary`, etc) and patches them in
 *   place rather than duplicating.
 * - Pause / resume operate only on jobs PolitiClaw owns (name prefix
 *   `politiclaw.`) — they never touch user-authored jobs or other plugins'
 *   jobs.
 * - All mutations go through the gateway adapter (gatewayAdapter.ts). Nothing
 *   here touches `jobs.json` on disk — that is an explicit anti-goal from
 *   docs/plan.md Phase 4 ("never by editing jobs.json").
 */

import {
  getGatewayCronAdapter,
  type CronAddInput,
  type CronUpdatePatch,
  type GatewayCronJob,
} from "./gatewayAdapter.js";
import {
  POLITICLAW_CRON_NAMES,
  POLITICLAW_CRON_TEMPLATES,
  type PolitiClawCronTemplate,
} from "./templates.js";

export type MonitoringSetupAction = "created" | "updated" | "unchanged";

export type MonitoringSetupOutcome = {
  name: string;
  jobId: string;
  action: MonitoringSetupAction;
};

export type MonitoringSetupResult = {
  outcomes: MonitoringSetupOutcome[];
};

export type MonitoringToggleAction = "paused" | "resumed" | "unchanged" | "missing";

export type MonitoringToggleOutcome = {
  name: string;
  jobId: string | null;
  action: MonitoringToggleAction;
};

export type MonitoringToggleResult = {
  outcomes: MonitoringToggleOutcome[];
};

function toAddInput(template: PolitiClawCronTemplate): CronAddInput {
  return {
    name: template.name,
    description: template.description,
    enabled: true,
    schedule: template.schedule,
    sessionTarget: template.sessionTarget,
    wakeMode: template.wakeMode,
    payload: template.payload,
    delivery: template.delivery,
  };
}

/**
 * Returns true when the existing job already matches the template exactly —
 * schedule, sessionTarget, wakeMode, payload, delivery, description, and
 * enabled=true. Used to keep `setup_monitoring` quiet on no-op re-runs.
 *
 * Deliberately does not compare `id`, `createdAtMs`, `updatedAtMs`, or the
 * runtime `state` block — those are gateway-owned and would always "differ"
 * from a template.
 */
function matchesTemplate(
  job: GatewayCronJob,
  template: PolitiClawCronTemplate,
): boolean {
  if (!job.enabled) return false;
  if (job.description !== template.description) return false;
  if (job.sessionTarget !== template.sessionTarget) return false;
  if (job.wakeMode !== template.wakeMode) return false;
  if (!deepEqual(job.schedule, template.schedule)) return false;
  if (!deepEqual(job.payload, template.payload)) return false;
  if (!deepEqual(job.delivery ?? null, template.delivery)) return false;
  return true;
}

/**
 * Stable deep-equality for JSON-shaped values. Implemented inline (not via
 * JSON.stringify) because object-key order is not guaranteed across callers
 * and the comparison would spuriously fail on reordered properties from the
 * gateway.
 */
function deepEqual(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null || right == null) return left === right;
  if (typeof left !== typeof right) return false;
  if (typeof left !== "object") return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    for (let index = 0; index < left.length; index++) {
      if (!deepEqual(left[index], right[index])) return false;
    }
    return true;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord).sort();
  const rightKeys = Object.keys(rightRecord).sort();
  if (leftKeys.length !== rightKeys.length) return false;
  for (let index = 0; index < leftKeys.length; index++) {
    if (leftKeys[index] !== rightKeys[index]) return false;
    const key = leftKeys[index]!;
    if (!deepEqual(leftRecord[key], rightRecord[key])) return false;
  }
  return true;
}

/**
 * Install (or update in place) the three PolitiClaw monitoring cron jobs.
 * Idempotent: re-running produces "unchanged" outcomes when templates are
 * already live and matching.
 */
export async function setupMonitoring(): Promise<MonitoringSetupResult> {
  const adapter = getGatewayCronAdapter();
  const existing = await adapter.list({ includeDisabled: true });
  const byName = new Map<string, GatewayCronJob>();
  for (const job of existing) byName.set(job.name, job);

  const outcomes: MonitoringSetupOutcome[] = [];
  for (const template of POLITICLAW_CRON_TEMPLATES) {
    const current = byName.get(template.name);
    if (!current) {
      const created = await adapter.add(toAddInput(template));
      outcomes.push({ name: template.name, jobId: created.id, action: "created" });
      continue;
    }
    if (matchesTemplate(current, template)) {
      outcomes.push({ name: template.name, jobId: current.id, action: "unchanged" });
      continue;
    }
    const patch: CronUpdatePatch = {
      description: template.description,
      enabled: true,
      schedule: template.schedule,
      sessionTarget: template.sessionTarget,
      wakeMode: template.wakeMode,
      payload: template.payload,
      delivery: template.delivery,
    };
    const updated = await adapter.update(current.id, patch);
    outcomes.push({ name: template.name, jobId: updated.id, action: "updated" });
  }
  return { outcomes };
}

async function toggleMonitoring(
  targetEnabled: boolean,
): Promise<MonitoringToggleResult> {
  const adapter = getGatewayCronAdapter();
  const existing = await adapter.list({ includeDisabled: true });
  const byName = new Map<string, GatewayCronJob>();
  for (const job of existing) byName.set(job.name, job);

  const outcomes: MonitoringToggleOutcome[] = [];
  for (const name of POLITICLAW_CRON_NAMES) {
    const current = byName.get(name);
    if (!current) {
      outcomes.push({ name, jobId: null, action: "missing" });
      continue;
    }
    if (current.enabled === targetEnabled) {
      outcomes.push({ name, jobId: current.id, action: "unchanged" });
      continue;
    }
    const updated = await adapter.update(current.id, { enabled: targetEnabled });
    outcomes.push({
      name,
      jobId: updated.id,
      action: targetEnabled ? "resumed" : "paused",
    });
  }
  return { outcomes };
}

/**
 * Disable all PolitiClaw-owned cron jobs. Jobs not yet installed render as
 * `missing` — pause is a no-op on them.
 */
export function pauseMonitoring(): Promise<MonitoringToggleResult> {
  return toggleMonitoring(false);
}

/**
 * Re-enable all PolitiClaw-owned cron jobs. Does not (re)install jobs that
 * were never created — use `setupMonitoring` for that.
 */
export function resumeMonitoring(): Promise<MonitoringToggleResult> {
  return toggleMonitoring(true);
}
