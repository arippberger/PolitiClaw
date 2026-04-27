import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { explainMyBallot } from "../domain/ballot/explain.js";
import type {
  CandidateBio,
  ContestExplanation,
  ExplainMyBallotResult,
  FramingLine,
} from "../domain/ballot/explain.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import { createBallotResolver } from "../sources/ballot/index.js";
import { createWebSearchResolver } from "../sources/webSearch/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const ExplainMyBallotParams = Type.Object({
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "When true, bypass the cached ballot snapshot and re-query voterInfoQuery.",
    }),
  ),
});

/**
 * Appended to the output whenever any rendered line originated from the
 * web-search bio adapter — even at tier 1/2, because the narrative itself is
 * an LLM paraphrase of primary sources.
 */
const VERIFY_DISCLAIMER =
  "Candidate bio narratives above are LLM-search-derived summaries of cited sources. Verify any factual claim against the linked primary source before relying on it.";

/**
 * Stops-short-of-prescribing line. Shipped verbatim on every rendered
 * explanation. Directional framing is allowed ("advances/obstructs your
 * stance on X") when grounded in cited source text; outright vote
 * instructions are not.
 */
const NO_RECOMMENDATION_NOTICE =
  "This tool frames how each contest maps to your declared stances but stops short of telling you how to vote — that call is yours.";

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function renderFraming(lines: readonly FramingLine[]): string[] {
  return lines.map((line) => `     ${line.prefix}: ${line.body}`);
}

function renderBio(bio: CandidateBio): string[] {
  const header = `       • ${bio.candidateName} — tier ${bio.source.tier} (${bio.source.adapterId})`;
  const narrative = `         ${bio.payload.narrativeText}`;
  const citeLines = bio.payload.citations.map(
    (c) => `         - ${c.title ? `${c.title} — ` : ""}${c.url}`,
  );
  return [header, narrative, ...citeLines];
}

function renderContest(contest: ContestExplanation): string[] {
  const lines: string[] = [];
  lines.push(`  ${contest.index}. ${contest.title}`);
  lines.push(`     Coverage: ${contest.coverageLabel}`);

  if (contest.insufficientData) {
    lines.push(
      "     Status: insufficient data — no declared stance matched this contest's title/subtitle, and no bio enrichment is available.",
    );
  }

  lines.push(...renderFraming(contest.framing));

  if (contest.candidateBios.length > 0) {
    lines.push("     Candidate bios (LLM-search-derived; see verify disclaimer below):");
    for (const bio of contest.candidateBios) {
      lines.push(...renderBio(bio));
    }
  }

  return lines;
}

export function renderExplainMyBallotOutput(
  result: ExplainMyBallotResult,
): string {
  if (result.status === "no_preferences") {
    return `Cannot explain ballot: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "no_stances") {
    return `Cannot explain ballot: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` ${result.actionable}` : "";
    return `Ballot explanation unavailable: ${result.reason}.${hint}`;
  }

  const electionLabel = result.election?.name
    ? `${result.election.name}${result.election.electionDay ? ` — ${result.election.electionDay}` : ""}`
    : result.election?.electionDay ?? "Upcoming election";
  const cacheNote = result.fromCache ? " (cached snapshot)" : "";

  const lines: string[] = [
    `Ballot explanation for ${result.addressLine}`,
    `Election: ${electionLabel}`,
    `Ballot source: ${result.ballotSource.adapterId} (tier ${result.ballotSource.tier})${cacheNote}`,
    `Stance snapshot hash: ${result.stanceSnapshotHash}`,
    "",
    NO_RECOMMENDATION_NOTICE,
    "",
  ];

  if (result.contests.length === 0) {
    lines.push(
      "No contests were returned for this address. Use your official sample ballot or state portal.",
    );
  } else {
    lines.push("Per-contest framing:");
    for (const contest of result.contests) {
      lines.push(...renderContest(contest));
      lines.push("");
    }
  }

  if (result.insufficientDataCount > 0) {
    lines.push(
      `${result.insufficientDataCount} contest${
        result.insufficientDataCount === 1 ? "" : "s"
      } flagged as insufficient data — declare more stances with politiclaw_set_issue_stance or consult your official sample ballot.`,
    );
    lines.push("");
  }

  const hasBios = result.contests.some(
    (contest) => contest.candidateBios.length > 0,
  );
  if (hasBios) {
    lines.push(VERIFY_DISCLAIMER);
    lines.push("");
  }

  lines.push(ALIGNMENT_DISCLAIMER);
  return lines.join("\n");
}

export const explainMyBallotTool: AnyAgentTool = {
  name: "politiclaw_explain_my_ballot",
  label:
    "Explain each contest on your ballot with facts + framing — never a recommendation",
  description:
    "Per-contest, non-prescriptive framing of your ballot. For measures, renders deterministic " +
    "'A YES vote would…' / 'A NO vote would…' lines drawn from Google Civic's published summary " +
    "(tier 2 aggregator — verify against official text). For candidate races, explains what the race " +
    "decides and attaches candidate bios from the tier-5 web-search adapter when wired. Never says " +
    "'vote YES/NO'. Always includes the verify-against-official-source disclaimer when " +
    "any rendered line is LLM-search-derived. Requires declared issue stances, a saved " +
    "address, and plugins.politiclaw.apiKeys.googleCivic.",
  parameters: ExplainMyBallotParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ExplainMyBallotParams, rawParams);
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
    // No bio transport is wired in production yet (see src/sources/webSearch/
    // bios.ts). The resolver returns "unavailable" and the domain degrades
    // silently — the framing output is still useful from structured sources
    // alone. Tests inject a fetcher directly.
    const webSearch = createWebSearchResolver();

    const result = await explainMyBallot(db, resolver, {
      refresh: parsed.data.refresh === true,
      webSearch,
    });

    return textResult(renderExplainMyBallotOutput(result), result);
  },
};

export const explainBallotTools: AnyAgentTool[] = [explainMyBallotTool];
