import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { getBallotSnapshot } from "../domain/ballot/index.js";
import type { GetBallotSnapshotResult } from "../domain/ballot/index.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import { createBallotResolver } from "../sources/ballot/index.js";
import type { NormalizedBallotContest } from "../sources/ballot/types.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const GetMyBallotParams = Type.Object({
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "When true, bypass the cached Google Civic snapshot and re-query voterInfoQuery.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function describeContestCoverage(contest: NormalizedBallotContest): string {
  if (contest.referendumTitle) {
    return "PARTIAL — measure metadata from Google Civic; read the full text on your official sample ballot.";
  }
  if (contest.candidates.length > 0) {
    return "PARTIAL — candidate names/parties from Google Civic (tier 2 aggregator); verify positions against primary sources.";
  }
  return "NOT COVERED — no structured rows returned for this contest; use your official sample ballot URL.";
}

export function renderGetMyBallotOutput(result: GetBallotSnapshotResult): string {
  if (result.status === "no_preferences") {
    return `Cannot load ballot: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` ${result.actionable}` : "";
    return `Ballot logistics unavailable: ${result.reason}.${hint}`;
  }

  const { ballot, addressLine, fromCache, source } = result;
  const electionLabel = ballot.election?.name
    ? `${ballot.election.name}${ballot.election.electionDay ? ` — ${ballot.election.electionDay}` : ""}`
    : ballot.election?.electionDay ?? "Upcoming election";

  const cacheNote = fromCache ? " (cached snapshot)" : "";
  const headerLines = [
    `Ballot preview for ${addressLine}`,
    `Election: ${electionLabel}`,
    `Source: ${source.adapterId} (tier ${source.tier})${cacheNote}`,
  ];

  if (ballot.registrationUrl) {
    headerLines.push(`Registration: ${ballot.registrationUrl}`);
  }
  if (ballot.electionAdministrationUrl) {
    headerLines.push(`State election info: ${ballot.electionAdministrationUrl}`);
  }

  const pollingCountLabel = `${ballot.pollingLocationCount} location${
    ballot.pollingLocationCount === 1 ? "" : "s"
  }`;
  if (ballot.primaryPolling) {
    const polling = ballot.primaryPolling;
    const addressParts = [polling.line1, polling.city, polling.state, polling.zip].filter(Boolean);
    const addressSuffix = addressParts.length > 0 ? ` — ${addressParts.join(", ")}` : "";
    headerLines.push(
      `Polling preview (${pollingCountLabel}): ${polling.locationName ?? "Polling place"}${addressSuffix}`,
    );
    if (polling.pollingHours) {
      headerLines.push(`Hours (first location): ${polling.pollingHours}`);
    }
  } else if (ballot.pollingLocationCount > 0) {
    headerLines.push(
      `Polling locations: ${pollingCountLabel} returned, but Google Civic did not include address details — consult your state portal for the exact location.`,
    );
  } else {
    headerLines.push(
      "Polling locations: none returned for this query — check your official sample ballot or state portal.",
    );
  }

  headerLines.push("");
  headerLines.push(
    "Per-contest coverage (Google Civic default data; verify against official state sources where available):",
  );

  let index = 1;
  for (const contest of ballot.contests) {
    const title =
      contest.office ??
      contest.referendumTitle ??
      contest.districtScope ??
      "Contest";
    const tierLine = describeContestCoverage(contest);
    headerLines.push(`  ${index}. ${title}`);
    headerLines.push(`     ${tierLine}`);
    if (contest.candidates.length > 0) {
      const candidateLines = contest.candidates.map((candidate) => {
        const party = candidate.party ? ` (${candidate.party})` : "";
        const link = candidate.candidateUrl ? ` — ${candidate.candidateUrl}` : "";
        return `        - ${candidate.name ?? "Unknown"}${party}${link}`;
      });
      headerLines.push(...candidateLines);
    }
    index += 1;
  }

  headerLines.push("");
  headerLines.push(ALIGNMENT_DISCLAIMER);

  return headerLines.join("\n");
}

export const getMyBallotTool: AnyAgentTool = {
  name: "politiclaw_get_my_ballot",
  label: "Preview ballot logistics and contests for your saved address",
  description:
    "Fetch election logistics and contest rows from Google Civic voterInfoQuery. " +
    "Requires plugins.politiclaw.apiKeys.googleCivic with the Civic Information API enabled. " +
    "Coverage labels are honest: this tool lists what Google returns today and marks each race PARTIAL unless fuller structured coverage is available.",
  parameters: GetMyBallotParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(GetMyBallotParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const configuration = getPluginConfig();
    const resolver = createBallotResolver({
      googleCivicApiKey: configuration.apiKeys?.googleCivic,
    });

    const snapshot = await getBallotSnapshot(db, resolver, {
      refresh: parsed.data.refresh === true,
    });

    return textResult(renderGetMyBallotOutput(snapshot), snapshot);
  },
};

export const ballotTools: AnyAgentTool[] = [getMyBallotTool];
