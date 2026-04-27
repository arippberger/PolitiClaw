import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import { type CheckStatus, runDoctor } from "../domain/doctor/checks.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const STATUS_GLYPH: Record<CheckStatus, string> = {
  ok: "ok",
  warn: "warn",
  fail: "fail",
};

export const doctorCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-doctor",
  description:
    "Run the doctor health check across schema, preferences, API keys, reps cache, and cron jobs.",
  acceptsArgs: false,
  requireAuth: false,
  handler: async () => {
    const { db } = getStorage();
    const config = getPluginConfig();
    const report = await runDoctor({ db, config });

    const lines: string[] = [
      `PolitiClaw doctor — overall: ${report.worst.toUpperCase()}`,
    ];
    for (const check of report.checks) {
      lines.push(
        `  [${STATUS_GLYPH[check.status]}] ${check.label}: ${check.summary}`,
      );
      if (check.actionable && check.status !== "ok") {
        lines.push(`        ${check.actionable}`);
      }
    }
    return { text: lines.join("\n") };
  },
};
