import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import { API_KEY_FLAGS } from "../domain/doctor/checks.js";
import { getPluginConfig } from "../storage/context.js";

export const keysCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-keys",
  description:
    "List supported API keys, what each unlocks, and which are configured today.",
  acceptsArgs: false,
  requireAuth: false,
  handler: () => {
    const keys = getPluginConfig().apiKeys ?? {};
    const lines: string[] = ["PolitiClaw API keys:"];
    for (const flag of API_KEY_FLAGS) {
      const present =
        typeof keys[flag.key] === "string" &&
        (keys[flag.key] ?? "").length > 0;
      const requirement = flag.required ? "required" : "optional";
      const state = present ? "set" : "not set";
      lines.push(
        `  ${flag.label} (${requirement}, ${state}) — ${flag.unlocks}`,
      );
    }
    lines.push("");
    lines.push(
      "Save keys via politiclaw_configure (pass apiDataGov and any optional keys).",
    );
    return { text: lines.join("\n") };
  },
};
