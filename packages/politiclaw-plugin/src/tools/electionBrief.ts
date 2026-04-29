import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  prepareForElection,
  type PrepareForElectionResult,
  type RepScoreEntry,
} from "../domain/ballot/prepareForElection.js";
import type { ExplainMyBallotResult } from "../domain/ballot/explain.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import { createBallotResolver } from "../sources/ballot/index.js";
import { createWebSearchResolver } from "../sources/webSearch/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const ElectionBriefParams = Type.Object({
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "When true, bypass the cached ballot snapshot and re-query voterInfoQuery.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function renderSetupNeeded(
  missing: Extract<PrepareForElectionResult, { status: "setup_needed" }>["missing"],
): string {
  const lines: string[] = [
    "Setup needed before I can map this ballot against the values you've declared:",
    "",
  ];
  for (const step of missing) {
    lines.push(`  • ${step.reason} — ${step.actionable}.`);
  }
  lines.push(
    "",
    "Run the tools above in order, then call politiclaw_election_brief again.",
  );
  return lines.join("\n");
}

function renderBallotUnavailable(
  result: Extract<PrepareForElectionResult, { status: "ballot_unavailable" }>,
): string {
  const hint = result.actionable ? ` ${result.actionable}.` : "";
  const adapter = result.adapterId ? ` (${result.adapterId})` : "";
  return `Ballot data unavailable${adapter}: ${result.reason}.${hint}`;
}

function renderElection(ballot: Extract<ExplainMyBallotResult, { status: "ok" }>): string[] {
  const lines: string[] = [];
  const electionLabel = ballot.election?.name
    ? `${ballot.election.name}${
        ballot.election.electionDay ? ` — ${ballot.election.electionDay}` : ""
      }`
    : ballot.election?.electionDay ?? "Upcoming election";
  lines.push(`Election: ${electionLabel}`);
  lines.push(`Address on file: ${ballot.addressLine}`);
  lines.push(
    `Ballot source: ${ballot.ballotSource.adapterId} (tier ${ballot.ballotSource.tier})${
      ballot.fromCache ? " — cached snapshot" : ""
    }`,
  );
  return lines;
}

function renderContests(ballot: Extract<ExplainMyBallotResult, { status: "ok" }>): string[] {
  if (ballot.contests.length === 0) {
    return [
      "No contests returned for this address — consult your official sample ballot or state voter portal.",
    ];
  }
  const lines: string[] = ["Per-contest framing:"];
  for (const contest of ballot.contests) {
    lines.push(`  ${contest.index}. ${contest.title}`);
    lines.push(`     Coverage: ${contest.coverageLabel}`);
    if (contest.insufficientData) {
      lines.push(
        "     Status: insufficient data — no declared stance matched and no bio enrichment available.",
      );
    }
    for (const frame of contest.framing) {
      lines.push(`     ${frame.prefix}: ${frame.body}`);
    }
    for (const bio of contest.candidateBios) {
      lines.push(
        `       • ${bio.candidateName} — tier ${bio.source.tier} (${bio.source.adapterId})`,
      );
      lines.push(`         ${bio.payload.narrativeText}`);
      for (const cite of bio.payload.citations) {
        lines.push(`         - ${cite.title ? `${cite.title} — ` : ""}${cite.url}`);
      }
    }
    lines.push("");
  }
  return lines;
}

function renderRepScores(entries: readonly RepScoreEntry[]): string[] {
  if (entries.length === 0) return [];
  const lines: string[] = ["Your current representatives — alignment snapshot:"];
  for (const { rep, result } of entries) {
    if (result.status !== "ok") {
      lines.push(`  • ${rep.name} (${rep.office}): ${result.reason}.`);
      continue;
    }
    const totalConsidered = result.consideredVoteCount;
    const issues = result.perIssue;
    const allBelowFloor = issues.every((issue) => issue.belowConfidenceFloor);
    if (issues.length === 0 || allBelowFloor) {
      lines.push(
        `  • ${rep.name} (${rep.office}): insufficient data across ${totalConsidered} counted vote${
          totalConsidered === 1 ? "" : "s"
        } — use politiclaw_score_representative for coverage hints.`,
      );
      continue;
    }
    const issueFrags = issues
      .filter((issue) => !issue.belowConfidenceFloor)
      .map((issue) => `${issue.issue} ${Math.round(issue.alignmentScore * 100)}%`);
    lines.push(
      `  • ${rep.name} (${rep.office}): ${issueFrags.join(", ")} across ${totalConsidered} counted vote${
        totalConsidered === 1 ? "" : "s"
      }.`,
    );
  }
  return lines;
}

export function renderElectionBriefOutput(
  result: PrepareForElectionResult,
): string {
  if (result.status === "setup_needed") return renderSetupNeeded(result.missing);
  if (result.status === "ballot_unavailable") return renderBallotUnavailable(result);

  const sections: string[] = [];
  sections.push(...renderElection(result.ballot));
  sections.push(
    "",
    "This guide frames how each contest maps to your declared stances but stops short of telling you how to vote — that call is yours.",
    "",
  );
  sections.push(...renderContests(result.ballot));
  if (result.ballot.insufficientDataCount > 0) {
    sections.push(
      `${result.ballot.insufficientDataCount} contest${
        result.ballot.insufficientDataCount === 1 ? "" : "s"
      } flagged insufficient data — declare more stances with politiclaw_configure or consult your official sample ballot.`,
      "",
    );
  }
  sections.push(...renderRepScores(result.repScores));
  sections.push(
    "",
    "For deeper per-candidate research: politiclaw_research_finance with mode='candidate' (single candidate) or mode='challengers' (side-by-side).",
    "",
    ALIGNMENT_DISCLAIMER,
  );
  return sections.join("\n");
}

export const electionBriefTool: AnyAgentTool = {
  name: "politiclaw_election_brief",
  label: "One readable election guide: ballot framing + rep alignment + setup checks",
  description:
    "Map the user's ballot against the values they declared: composes saved address, declared stances, " +
    "stored reps' alignment records, and ballot snapshot into one readable guide so the user can " +
    "see how each contest and incumbent lines up with — or diverges from — their stated stances. " +
    "Runs the prereq checks itself; missing address, missing reps, or missing stances return a " +
    "'setup needed' pointer at the exact tool to run, not a stack trace. Use this as the default " +
    "when the user says 'help me with my ballot' or 'what do I need to know for the election.' " +
    "Framing is facts + tradeoffs; it never tells the user how to vote. " +
    "politiclaw_get_my_ballot remains available for the raw fetch when you only need the ballot data.",
  parameters: ElectionBriefParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ElectionBriefParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createBallotResolver({
      googleCivicApiKey: cfg.apiKeys?.googleCivic,
    });
    const webSearch = createWebSearchResolver();

    const result = await prepareForElection(db, resolver, {
      refresh: parsed.data.refresh === true,
      webSearch,
    });
    return textResult(renderElectionBriefOutput(result), result);
  },
};

export const electionBriefTools: AnyAgentTool[] = [electionBriefTool];
