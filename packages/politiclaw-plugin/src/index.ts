import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { REGISTERED_POLITICLAW_COMMANDS } from "./commands/index.js";
import { getGatewayCronAdapter } from "./cron/gatewayAdapter.js";
import { REGISTERED_POLITICLAW_TOOLS } from "./docs/toolRegistry.js";
import { createDashboardRoute } from "./http/routes.js";
import { configureStorage, getStorage, type PluginConfigSnapshot } from "./storage/context.js";

export default definePluginEntry({
  id: "politiclaw",
  name: "PolitiClaw",
  description:
    "Local-first civic copilot that holds your representatives accountable to the values you declare. Learns the stances you care about, watches federal legislation and elections for you, and flags when your reps' votes and actions align — or don't — with those stances. Drafts letters you send yourself; never speaks on your behalf and never tells you how to vote.",
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

    // Auto-reply commands. These bypass the LLM entirely and return canned
    // text the user can use to navigate the plugin without burning model
    // tokens — help, status, doctor, keys, version. The data inside each
    // command is sourced from the same metadata the docs generator reads,
    // so wording stays in sync with the published reference automatically.
    for (const command of REGISTERED_POLITICLAW_COMMANDS) api.registerCommand(command);

    // Dashboard. Served under `/politiclaw/*` on the
    // gateway's HTTP surface. Auth is "plugin" (no gateway-side auth);
    // exposure is local-only by default — document the remote-exposure
    // caveat if the gateway is reachable off-host. Route builds its own
    // storage handle lazily per request so dashboard pageloads do not
    // force the DB open at plugin boot.
    const dashboardRoute = createDashboardRoute({
      deps: {
        get db() {
          return getStorage().db;
        },
        cronAdapter: getGatewayCronAdapter(),
      },
    });
    api.registerHttpRoute(dashboardRoute);

    api.logger.info(
      "PolitiClaw: registered " +
        `${REGISTERED_POLITICLAW_TOOLS.length} tools ` +
        `(${REGISTERED_POLITICLAW_TOOLS.map((tool) => tool.name).join(", ")}), ` +
        `${REGISTERED_POLITICLAW_COMMANDS.length} commands ` +
        `(${REGISTERED_POLITICLAW_COMMANDS.map((cmd) => `/${cmd.name}`).join(", ")})` +
        ", dashboard at /politiclaw",
    );
  },
});
