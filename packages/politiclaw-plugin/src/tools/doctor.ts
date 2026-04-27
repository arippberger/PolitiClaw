import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { runDoctor, type DoctorCheck, type DoctorReport } from "../domain/doctor/index.js";
import { getGatewayCronAdapter } from "../cron/gatewayAdapter.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const EmptyParams = Type.Object({});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function marker(status: DoctorCheck["status"]): string {
  switch (status) {
    case "ok":
      return "[ok]";
    case "warn":
      return "[warn]";
    case "fail":
      return "[fail]";
  }
}

export function renderDoctorOutput(report: DoctorReport): string {
  const counts = {
    ok: report.checks.filter((c) => c.status === "ok").length,
    warn: report.checks.filter((c) => c.status === "warn").length,
    fail: report.checks.filter((c) => c.status === "fail").length,
  };
  const header =
    report.worst === "ok"
      ? `PolitiClaw doctor: all ${counts.ok} check(s) green.`
      : `PolitiClaw doctor: ${counts.fail} fail, ${counts.warn} warn, ${counts.ok} ok.`;
  const checkLines = report.checks.map((check) => {
    const base = `${marker(check.status)} ${check.label}: ${check.summary}`;
    return check.actionable ? `${base}\n    → ${check.actionable}` : base;
  });
  const lines: string[] = [header, ...checkLines];
  if (report.monitoringContract) {
    const contract = report.monitoringContract;
    lines.push("");
    lines.push(
      `Current monitoring mode: ${contract.monitoring.mode}.`,
    );
    lines.push(
      `Current accountability: ${contract.accountability.label}.`,
    );
    lines.push(
      `Active monitoring jobs: ${contract.activeJobs.length}; inactive: ${contract.inactiveJobs.length}.`,
    );
  }
  return lines.join("\n");
}

export const doctorTool: AnyAgentTool = {
  name: "politiclaw_doctor",
  label: "Diagnose PolitiClaw install health",
  description:
    "Run a local health check: schema version, SQLite integrity, preferences, API keys, " +
    "reps cache, and monitoring cron status. Returns a structured report with ok/warn/fail " +
    "per check plus an actionable hint for every non-ok result. Read-only — never modifies " +
    "state. Call this first when something looks broken.",
  parameters: EmptyParams,
  async execute() {
    try {
      const { db } = getStorage();
      const config = getPluginConfig();
      const report = await runDoctor({
        db,
        config,
        cronAdapter: getGatewayCronAdapter(),
      });
      return textResult(renderDoctorOutput(report), report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return textResult(`Doctor run failed: ${message}.`, {
        status: "error",
        error: message,
      });
    }
  },
};

export const doctorTools: AnyAgentTool[] = [doctorTool];
