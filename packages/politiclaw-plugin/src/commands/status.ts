import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import { API_KEY_FLAGS } from "../domain/doctor/checks.js";
import {
  describeOnboardingCheckpoint,
  getOnboardingCheckpoint,
} from "../domain/onboarding/checkpoint.js";
import {
  ACCOUNTABILITY_LABELS,
  getPreferences,
  listIssueStances,
} from "../domain/preferences/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

export const statusCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-status",
  description:
    "Snapshot of saved address, issue-stance count, monitoring mode, and API key state.",
  acceptsArgs: false,
  requireAuth: false,
  handler: () => {
    const { db, kv } = getStorage();
    const prefs = getPreferences(db);
    const stances = listIssueStances(db);
    const keys = getPluginConfig().apiKeys ?? {};
    const checkpoint = getOnboardingCheckpoint(kv);

    const presentKeys = API_KEY_FLAGS.filter(
      (flag) =>
        typeof keys[flag.key] === "string" && (keys[flag.key] ?? "").length > 0,
    ).length;

    const lines: string[] = ["PolitiClaw status:"];
    if (prefs) {
      const stateZip = [prefs.state, prefs.zip].filter(Boolean).join(" ");
      lines.push(`  Address saved: ${stateZip || "yes (state/zip unset)"}`);
      lines.push(`  Monitoring mode: ${prefs.monitoringMode}`);
      lines.push(
        `  Accountability: ${ACCOUNTABILITY_LABELS[prefs.accountability]}`,
      );
      lines.push(`  Action prompting: ${prefs.actionPrompting}`);
    } else {
      lines.push("  No address saved yet.");
      lines.push("  Use /politiclaw-setup for the next setup prompt.");
    }
    lines.push(`  Issue stances: ${stances.length}`);
    lines.push(
      `  API keys configured: ${presentKeys}/${API_KEY_FLAGS.length} known`,
    );
    if (checkpoint) {
      lines.push(`  Setup checkpoint: ${describeOnboardingCheckpoint(checkpoint)}`);
      lines.push("  Next: use /politiclaw-setup to resume cleanly.");
    }
    return { text: lines.join("\n") };
  },
};
