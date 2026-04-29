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
    let db: ReturnType<typeof getStorage>["db"];
    try {
      ({ db } = getStorage());
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        text: [
          "PolitiClaw doctor — install/package check failed before storage opened.",
          "",
          `Storage initialization error: ${message}`,
          "",
          "This usually means the packaged plugin is missing runtime files or the OpenClaw gateway did not initialize the plugin state directory.",
          "Verify the plugin is enabled, restart the OpenClaw gateway, then run /politiclaw-version.",
          "If this came from an npm package, reinstall or upgrade PolitiClaw and run /politiclaw-doctor again.",
        ].join("\n"),
      };
    }
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
