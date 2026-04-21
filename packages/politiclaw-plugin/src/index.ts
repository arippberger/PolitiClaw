import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { REGISTERED_POLITICLAW_TOOLS } from "./docs/toolRegistry.js";
import { configureStorage, type PluginConfigSnapshot } from "./storage/context.js";

export default definePluginEntry({
  id: "politiclaw",
  name: "PolitiClaw",
  description:
    "Local-first personal political co-pilot: monitors legislation, tracks representatives, prepares you for elections, and drafts outreach.",
  register(api) {
    // Memory posture: every byte of political data this plugin generates —
    // stances, alignments, rep scores, ballot explanations, letter drafts —
    // stays in the plugin-private SQLite database under the plugin's state
    // directory. Nothing is written to shared OpenClaw memory, and no call in
    // this file or its tools touches a shared-memory surface. If a future
    // feature ever needs to share political content across the wider agent,
    // that feature must be gated behind the `features.shareToMainMemory`
    // config flag (opt-in, off by default) and must be the slice that
    // introduces the flag — do not add an ungated flag speculatively. The
    // rationale: political views are sensitive, and an agent-wide memory
    // surface that silently absorbs them would break the privacy expectation
    // users have of a local-first civic plugin.
    configureStorage(
      () => api.runtime.state.resolveStateDir(),
      () => (api.pluginConfig ?? {}) as PluginConfigSnapshot,
    );
    for (const tool of REGISTERED_POLITICLAW_TOOLS) api.registerTool(tool);
    api.logger.info(
      "PolitiClaw: registered " +
        `${REGISTERED_POLITICLAW_TOOLS.length} tools ` +
        `(${REGISTERED_POLITICLAW_TOOLS.map((tool) => tool.name).join(", ")})`,
    );
  },
});
