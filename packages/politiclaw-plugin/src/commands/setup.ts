import type { OpenClawPluginCommandDefinition } from "openclaw/plugin-sdk/plugin-entry";

import {
  describeOnboardingCheckpoint,
  getOnboardingCheckpoint,
} from "../domain/onboarding/checkpoint.js";
import { getPreferences, listIssueStances } from "../domain/preferences/index.js";
import { getStorage } from "../storage/context.js";

function agentPromptFor(stage: string): string {
  if (stage === "address") {
    return "Ask your agent: Call the agent tool `politiclaw_configure` with my street address.";
  }
  return "Ask your agent: Continue PolitiClaw setup by calling the agent tool `politiclaw_configure` with `{}`.";
}

export const setupCommand: OpenClawPluginCommandDefinition = {
  name: "politiclaw-setup",
  description:
    "Show the next PolitiClaw setup step and a copyable agent-tool prompt.",
  acceptsArgs: false,
  requireAuth: false,
  handler: () => {
    const { db, kv } = getStorage();
    const preferences = getPreferences(db);
    const stances = listIssueStances(db);
    const checkpoint = getOnboardingCheckpoint(kv);

    if (checkpoint) {
      return {
        text: [
          "PolitiClaw setup is in progress.",
          `  ${describeOnboardingCheckpoint(checkpoint)}`,
          "",
          agentPromptFor(checkpoint.stage),
          "If the gateway just restarted, this resumes from saved plugin state; you do not need to repeat earlier answers.",
        ].join("\n"),
      };
    }

    if (!preferences) {
      return {
        text: [
          "PolitiClaw setup has not started yet.",
          "",
          agentPromptFor("address"),
          "After that, the tool will ask one setup question at a time.",
        ].join("\n"),
      };
    }

    if (stances.length === 0) {
      return {
        text: [
          "PolitiClaw has an address saved, but no issue stances yet.",
          "",
          agentPromptFor("issues"),
        ].join("\n"),
      };
    }

    return {
      text: [
        "PolitiClaw setup looks complete.",
        "Use /politiclaw-status for the saved snapshot or /politiclaw-doctor for a deeper health check.",
        "",
        "Common follow-ups: ask the agent to call `politiclaw_election_brief`, `politiclaw_check_upcoming_votes`, or `politiclaw_issue_stances`.",
      ].join("\n"),
    };
  },
};
