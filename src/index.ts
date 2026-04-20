import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { configureStorage, type PluginConfigSnapshot } from "./storage/context.js";
import { politiclawTools as preferencesTools } from "./tools/preferences.js";
import { repsTools } from "./tools/reps.js";
import { shapefileTools } from "./tools/downloadShapefiles.js";
import { ballotTools } from "./tools/ballot.js";
import { explainBallotTools } from "./tools/explainBallot.js";
import { billsTools } from "./tools/bills.js";
import { scoringTools } from "./tools/scoring.js";
import { repReportTools } from "./tools/repReport.js";
import { repScoringTools } from "./tools/repScoring.js";
import { monitoringTools } from "./tools/monitoring.js";
import { monitoringSetupTools } from "./tools/monitoringSetup.js";
import { voteIngestTools } from "./tools/voteIngest.js";
import { researchCandidateTools } from "./tools/researchCandidate.js";
import { researchChallengersTools } from "./tools/researchChallengers.js";

const allTools = [
  ...preferencesTools,
  ...repsTools,
  ...shapefileTools,
  ...billsTools,
  ...ballotTools,
  ...explainBallotTools,
  ...scoringTools,
  ...repScoringTools,
  ...repReportTools,
  ...monitoringTools,
  ...monitoringSetupTools,
  ...voteIngestTools,
  ...researchCandidateTools,
  ...researchChallengersTools,
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
