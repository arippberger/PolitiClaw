import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

import {
  pauseMonitoring,
  resumeMonitoring,
  setupMonitoring,
  type MonitoringSetupResult,
  type MonitoringToggleResult,
} from "../cron/setup.js";
import { POLITICLAW_CRON_NAMES } from "../cron/templates.js";

const EmptyParams = Type.Object({});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

/**
 * Render the outcome of `setup_monitoring`. Honest on no-op re-runs ("already
 * live") and explicit about which jobs were created vs patched vs unchanged
 * so the user can reason about what this turn did.
 */
export function renderSetupMonitoringOutput(result: MonitoringSetupResult): string {
  const lines = result.outcomes.map((outcome) => {
    const id = outcome.jobId ? ` (${outcome.jobId})` : "";
    switch (outcome.action) {
      case "created":
        return `- ${outcome.name}: installed${id}`;
      case "updated":
        return `- ${outcome.name}: updated in place${id}`;
      case "unchanged":
        return `- ${outcome.name}: already live, no change${id}`;
    }
  });
  const header =
    result.outcomes.every((outcome) => outcome.action === "unchanged")
      ? "PolitiClaw monitoring jobs already installed. No change."
      : "PolitiClaw monitoring jobs installed:";
  return [header, ...lines].join("\n");
}

/**
 * Render pause/resume outcomes. `missing` entries point the user at
 * `politiclaw_setup_monitoring`, which is the only tool that installs jobs.
 */
export function renderToggleMonitoringOutput(
  result: MonitoringToggleResult,
  verb: "paused" | "resumed",
): string {
  const lines = result.outcomes.map((outcome) => {
    const id = outcome.jobId ? ` (${outcome.jobId})` : "";
    switch (outcome.action) {
      case "paused":
        return `- ${outcome.name}: paused${id}`;
      case "resumed":
        return `- ${outcome.name}: resumed${id}`;
      case "unchanged":
        return `- ${outcome.name}: already ${verb === "paused" ? "paused" : "active"}${id}`;
      case "missing":
        return `- ${outcome.name}: not installed (run politiclaw_setup_monitoring first)`;
    }
  });
  const anyMissing = result.outcomes.some((outcome) => outcome.action === "missing");
  const anyActed = result.outcomes.some(
    (outcome) => outcome.action === "paused" || outcome.action === "resumed",
  );
  const header = anyActed
    ? `PolitiClaw monitoring ${verb}:`
    : anyMissing
      ? "No PolitiClaw monitoring jobs to toggle (nothing installed yet):"
      : `PolitiClaw monitoring already ${verb === "paused" ? "paused" : "active"}.`;
  return [header, ...lines].join("\n");
}

export const setupMonitoringTool: AnyAgentTool = {
  name: "politiclaw_setup_monitoring",
  label: "Install PolitiClaw default monitoring cron jobs",
  description:
    "Install (or upsert in place) the default PolitiClaw monitoring cron jobs: " +
    "weekly_summary (every 7d), rep_vote_watch (every 6h), tracked_hearings (every 12h), " +
    "rep_report (~every 30d). Idempotent — re-running patches existing jobs rather than " +
    "duplicating them. Submits via the gateway's cron.add / cron.update RPC; " +
    "does not edit jobs.json directly. Behavior of each job is controlled by " +
    `the skills/politiclaw-monitoring and skills/politiclaw-summary markdown — ` +
    "the agent can retune either without a plugin rebuild.",
  parameters: EmptyParams,
  async execute() {
    try {
      const result = await setupMonitoring();
      return textResult(renderSetupMonitoringOutput(result), result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return textResult(
        `Monitoring setup failed: ${message}. The gateway must be reachable and the agent must have cron scope.`,
        { status: "error", error: message },
      );
    }
  },
};

export const pauseMonitoringTool: AnyAgentTool = {
  name: "politiclaw_pause_monitoring",
  label: "Pause all PolitiClaw monitoring cron jobs",
  description:
    "Disable every PolitiClaw-owned cron job (names prefixed " +
    `${JSON.stringify(POLITICLAW_CRON_NAMES[0])}, etc). Leaves user-authored and ` +
    "other-plugin jobs alone. Idempotent; jobs already paused render as " +
    "'already paused'.",
  parameters: EmptyParams,
  async execute() {
    try {
      const result = await pauseMonitoring();
      return textResult(renderToggleMonitoringOutput(result, "paused"), result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return textResult(`Monitoring pause failed: ${message}.`, {
        status: "error",
        error: message,
      });
    }
  },
};

export const resumeMonitoringTool: AnyAgentTool = {
  name: "politiclaw_resume_monitoring",
  label: "Resume paused PolitiClaw monitoring cron jobs",
  description:
    "Re-enable every PolitiClaw-owned cron job. Does not re-install jobs that " +
    "were never created — use politiclaw_setup_monitoring for that. " +
    "Idempotent; jobs already active render as 'already active'.",
  parameters: EmptyParams,
  async execute() {
    try {
      const result = await resumeMonitoring();
      return textResult(renderToggleMonitoringOutput(result, "resumed"), result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return textResult(`Monitoring resume failed: ${message}.`, {
        status: "error",
        error: message,
      });
    }
  },
};

export const monitoringSetupTools: AnyAgentTool[] = [
  setupMonitoringTool,
  pauseMonitoringTool,
  resumeMonitoringTool,
];
