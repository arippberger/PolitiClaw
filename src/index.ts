import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { configureStorage, type PluginConfigSnapshot } from "./storage/context.js";
import { politiclawTools as preferencesTools } from "./tools/preferences.js";
import { repsTools } from "./tools/reps.js";
import { shapefileTools } from "./tools/downloadShapefiles.js";
import { billsTools } from "./tools/bills.js";
import { scoringTools } from "./tools/scoring.js";
import { monitoringTools } from "./tools/monitoring.js";
import { monitoringSetupTools } from "./tools/monitoringSetup.js";

const allTools = [
  ...preferencesTools,
  ...repsTools,
  ...shapefileTools,
  ...billsTools,
  ...scoringTools,
  ...monitoringTools,
  ...monitoringSetupTools,
];

export default definePluginEntry({
  id: "politiclaw",
  name: "PolitiClaw",
  description:
    "Local-first personal political co-pilot: monitors legislation, tracks representatives, prepares you for elections, and drafts outreach.",
  register(api) {
    configureStorage(
      () => api.runtime.state.resolveStateDir(),
      () => (api.pluginConfig ?? {}) as PluginConfigSnapshot,
    );
    for (const tool of allTools) api.registerTool(tool);
    api.logger.info(
      `PolitiClaw: registered ${allTools.length} tools (${allTools.map((t) => t.name).join(", ")})`,
    );
  },
});
