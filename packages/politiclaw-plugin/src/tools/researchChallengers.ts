import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import type {
  CompareChallengersResult,
  RaceComparison,
  RepChallengerResult,
} from "../domain/challengers/index.js";
import { compareChallengers } from "../domain/challengers/index.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import { createFinanceResolver } from "../sources/finance/index.js";
import type { FederalCandidateFinancialTotals } from "../sources/finance/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const ResearchChallengersParams = Type.Object({
  repId: Type.Optional(
    Type.String({
      description:
        "Optional: focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn.",
    }),
  ),
  cycle: Type.Optional(
    Type.Integer({
      description:
        "Optional four-digit election cycle (e.g. 2026). Defaults to the current year if even, otherwise next year.",
    }),
  ),
});

const ResearchChallengersInputSchema = z.object({
  repId: z.string().trim().min(1).optional(),
  cycle: z.number().int().min(1900).max(2100).optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "no data";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

function raceLabel(race: RaceComparison["race"], repName: string): string {
  if (race.office === "H") {
    return `US House ${race.state}-${race.district ?? "?"} — incumbent ${repName} — cycle ${race.cycle}`;
  }
  return `US Senate ${race.state} — incumbent ${repName} — cycle ${race.cycle}`;
}

function formatRow(
  candidate: { name: string; party?: string; candidateId: string },
  totals: FederalCandidateFinancialTotals | null,
  incumbent: boolean,
): string[] {
  const label = incumbent ? "INCUMBENT" : "challenger";
  const party = candidate.party ? ` [${candidate.party}]` : "";
  const header = `  • ${label} — ${candidate.name}${party} — FEC ${candidate.candidateId}`;
  if (!totals) {
    return [header, "      no FEC totals available for this cycle yet"];
  }
  return [
    header,
    `      receipts: ${formatUsd(totals.receipts)}`,
    `      disbursements: ${formatUsd(totals.disbursements)}`,
    `      cash on hand: ${formatUsd(totals.cashOnHandEndPeriod)}`,
    `      individual: ${formatUsd(totals.individualContributions)} · PAC: ${formatUsd(
      totals.pacContributions,
    )} · self-fund: ${formatUsd(totals.candidateSelfFunding)}`,
  ];
}

function formatRepRow(row: RepChallengerResult): string[] {
  if (row.status === "unmappable") {
    return [
      `Skipping ${row.rep.name} (${row.rep.office}${row.rep.state ? ` ${row.rep.state}` : ""}): ${row.reason}.`,
    ];
  }
  if (row.status === "unavailable") {
    const hint = row.actionable ? ` ${row.actionable}` : "";
    return [
      `Rep ${row.rep.name} (${row.rep.office}): FEC lookup unavailable — ${row.reason}.${hint}`,
    ];
  }
  const lines: string[] = [raceLabel(row.race.race, row.race.rep.name)];
  if (row.race.status === "no_candidates") {
    lines.push(
      "  No FEC candidates filed for this race yet in this cycle. Primary filing deadlines may not have passed.",
    );
    return lines;
  }
  for (const entry of row.race.rows) {
    lines.push(...formatRow(entry.candidate, entry.totals, entry.incumbent));
  }
  return lines;
}

export function renderResearchChallengersOutput(result: CompareChallengersResult): string {
  if (result.status === "no_reps") {
    return `Challenger comparison unavailable: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` ${result.actionable}` : "";
    return `Challenger comparison unavailable: ${result.reason}.${hint}`;
  }

  const lines: string[] = [
    `Challenger finance comparison — cycle ${result.cycle} — source: FEC OpenFEC (tier 1)`,
    "",
  ];
  for (const row of result.rows) {
    lines.push(...formatRepRow(row));
    lines.push("");
  }
  lines.push(
    "Finance numbers are FEC filings only. Industry breakdowns, top donors, and independent expenditures require an OpenSecrets key (optional upgrade).",
  );
  lines.push(
    "Voting records are not in this output. Pair with `politiclaw_score_representative` for incumbents' records.",
  );
  lines.push("");
  lines.push(ALIGNMENT_DISCLAIMER);
  return lines.join("\n");
}

export const researchChallengersTool: AnyAgentTool = {
  name: "politiclaw_research_challengers",
  label: "Compare incumbents and challengers by FEC finance totals",
  description:
    "For each stored rep (or a specific one via repId), look up every federal candidate filed for " +
    "that race this cycle and render a side-by-side FEC finance comparison. Dollar amounts come " +
    "only from FEC (tier 1). Pass `cycle` for historical comparisons. Requires " +
    "plugins.politiclaw.apiKeys.apiDataGov. Call politiclaw_get_my_reps first if no reps are stored.",
  parameters: ResearchChallengersParams,
  async execute(_toolCallId, rawParams) {
    const parsed = ResearchChallengersInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const configuration = getPluginConfig();
    const resolver = createFinanceResolver({
      apiDataGovKey: configuration.apiKeys?.apiDataGov,
    });

    const result = await compareChallengers(db, resolver, {
      repId: parsed.data.repId,
      cycle: parsed.data.cycle,
    });

    return textResult(renderResearchChallengersOutput(result), result);
  },
};

export const researchChallengersTools: AnyAgentTool[] = [researchChallengersTool];
