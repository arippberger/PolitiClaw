import type { AnyAgentTool } from "openclaw/plugin-sdk";

import { ballotTools } from "../tools/ballot.js";
import { billsTools } from "../tools/bills.js";
import { configureTools } from "../tools/configure.js";
import { doctorTools } from "../tools/doctor.js";
import { explainBallotTools } from "../tools/explainBallot.js";
import { letterTools } from "../tools/draftLetter.js";
import { monitoringTools } from "../tools/monitoring.js";
import { muteTools } from "../tools/mutes.js";
import { politiclawTools as preferencesTools } from "../tools/preferences.js";
import { prepareForElectionTools } from "../tools/prepareForElection.js";
import { repReportTools } from "../tools/repReport.js";
import { repScoringTools } from "../tools/repScoring.js";
import { repsTools } from "../tools/reps.js";
import { researchCandidateTools } from "../tools/researchCandidate.js";
import { researchChallengersTools } from "../tools/researchChallengers.js";
import { scoringTools } from "../tools/scoring.js";
import { voteIngestTools } from "../tools/voteIngest.js";

export type DocsToolGroupId =
  | "preferences"
  | "representatives"
  | "bills"
  | "ballot"
  | "monitoring"
  | "research"
  | "operations";

export type DocsToolEntry = {
  groupId: DocsToolGroupId;
  groupLabel: string;
  sourcePath: string;
  tool: AnyAgentTool;
};

export type DocsToolGroup = {
  id: DocsToolGroupId;
  label: string;
  description: string;
  entries: readonly DocsToolEntry[];
};

function makeEntries(
  groupId: DocsToolGroupId,
  groupLabel: string,
  sourcePath: string,
  tools: readonly AnyAgentTool[],
): DocsToolEntry[] {
  return tools.map((tool) => ({
    groupId,
    groupLabel,
    sourcePath,
    tool,
  }));
}

export const POLITICLAW_TOOL_GROUPS: readonly DocsToolGroup[] = [
  {
    id: "preferences",
    label: "Configuration and preferences",
    description:
      "Configure the plugin, declare issue stances, and manage the saved preference data that remains user-facing.",
    entries: [
      ...makeEntries(
        "preferences",
        "Configuration and preferences",
        "packages/politiclaw-plugin/src/tools/configure.ts",
        configureTools,
      ),
      ...makeEntries(
        "preferences",
        "Configuration and preferences",
        "packages/politiclaw-plugin/src/tools/preferences.ts",
        preferencesTools,
      ),
    ],
  },
  {
    id: "representatives",
    label: "Representatives and alignment",
    description:
      "Resolve federal representatives and summarize current alignment.",
    entries: [
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/reps.ts",
        repsTools,
      ),
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/repScoring.ts",
        repScoringTools,
      ),
      ...makeEntries(
        "representatives",
        "Representatives and alignment",
        "packages/politiclaw-plugin/src/tools/repReport.ts",
        repReportTools,
      ),
    ],
  },
  {
    id: "bills",
    label: "Bills and votes",
    description:
      "Search federal bills, inspect bill details, score bill alignment, and ingest House votes.",
    entries: [
      ...makeEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/bills.ts",
        billsTools,
      ),
      ...makeEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/scoring.ts",
        scoringTools,
      ),
      ...makeEntries(
        "bills",
        "Bills and votes",
        "packages/politiclaw-plugin/src/tools/voteIngest.ts",
        voteIngestTools,
      ),
    ],
  },
  {
    id: "ballot",
    label: "Ballot and election prep",
    description:
      "Fetch ballot data, explain contests, and assemble a single election guide.",
    entries: [
      ...makeEntries(
        "ballot",
        "Ballot and election prep",
        "packages/politiclaw-plugin/src/tools/ballot.ts",
        ballotTools,
      ),
      ...makeEntries(
        "ballot",
        "Ballot and election prep",
        "packages/politiclaw-plugin/src/tools/explainBallot.ts",
        explainBallotTools,
      ),
      ...makeEntries(
        "ballot",
        "Ballot and election prep",
        "packages/politiclaw-plugin/src/tools/prepareForElection.ts",
        prepareForElectionTools,
      ),
    ],
  },
  {
    id: "monitoring",
    label: "Monitoring and cadence",
    description:
      "Check upcoming federal activity and manage alert suppression once configuration is complete.",
    entries: [
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/monitoring.ts",
        monitoringTools,
      ),
      ...makeEntries(
        "monitoring",
        "Monitoring and cadence",
        "packages/politiclaw-plugin/src/tools/mutes.ts",
        muteTools,
      ),
    ],
  },
  {
    id: "research",
    label: "Candidate research and outreach",
    description:
      "Compare candidate finance data, research challengers, and draft constituent outreach.",
    entries: [
      ...makeEntries(
        "research",
        "Candidate research and outreach",
        "packages/politiclaw-plugin/src/tools/researchCandidate.ts",
        researchCandidateTools,
      ),
      ...makeEntries(
        "research",
        "Candidate research and outreach",
        "packages/politiclaw-plugin/src/tools/researchChallengers.ts",
        researchChallengersTools,
      ),
      ...makeEntries(
        "research",
        "Candidate research and outreach",
        "packages/politiclaw-plugin/src/tools/draftLetter.ts",
        letterTools,
      ),
    ],
  },
  {
    id: "operations",
    label: "Operations and diagnostics",
    description:
      "Run installation health checks and surface actionable fixes for broken setups.",
    entries: makeEntries(
      "operations",
      "Operations and diagnostics",
      "packages/politiclaw-plugin/src/tools/doctor.ts",
      doctorTools,
    ),
  },
];

export const REGISTERED_POLITICLAW_TOOLS: readonly AnyAgentTool[] =
  POLITICLAW_TOOL_GROUPS.flatMap((group) => group.entries.map((entry) => entry.tool));

export const REGISTERED_POLITICLAW_TOOL_DOCS: readonly DocsToolEntry[] =
  POLITICLAW_TOOL_GROUPS.flatMap((group) => group.entries);
