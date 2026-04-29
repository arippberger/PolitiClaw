import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import { TOOL_AUDIT_ENTRIES } from "../docs/toolAudit.js";
import { REGISTERED_POLITICLAW_TOOL_DOCS } from "../docs/toolRegistry.js";

const MAX_LINE_LEN = 110;

function summarize(description: string): string {
  const firstLine = description.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= MAX_LINE_LEN) return firstLine;
  return firstLine.slice(0, MAX_LINE_LEN - 1).trimEnd() + "…";
}

export const helpCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-help",
  description: "Show PolitiClaw's core entry points and quick commands.",
  acceptsArgs: false,
  requireAuth: false,
  handler: () => {
    const auditByName = new Map(
      TOOL_AUDIT_ENTRIES.map((entry) => [entry.name, entry] as const),
    );
    const coreTools = REGISTERED_POLITICLAW_TOOL_DOCS
      .filter((entry) => auditByName.get(entry.tool.name)?.tier === "core")
      .map(
        (entry) => `  ${entry.tool.name} — ${summarize(entry.tool.description)}`,
      );

    const lines: string[] = [
      "PolitiClaw — local-first civic copilot.",
      "",
      "Core tools (call these directly through the agent):",
      ...coreTools,
      "",
      "Quick commands (no agent invocation):",
      "  /politiclaw-setup — next setup step and copyable agent prompt",
      "  /politiclaw-status — saved address, stances, monitoring mode",
      "  /politiclaw-doctor — health check across schema, prefs, keys, cron",
      "  /politiclaw-keys — supported API keys and what each unlocks",
      "  /politiclaw-version — plugin version and OpenClaw runtime floor",
      "",
      "For deeper context, open the dashboard at /politiclaw on your gateway",
      "or read the published docs site.",
    ];
    return { text: lines.join("\n") };
  },
};
