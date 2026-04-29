import { type Static, Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  compareChallengers,
  type CompareChallengersResult,
  type RaceComparison,
  type RepChallengerResult,
} from "../domain/challengers/index.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import type { AdapterResult } from "../sources/common/types.js";
import { createFinanceResolver } from "../sources/finance/index.js";
import type {
  FederalCandidateFinancialSummary,
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
} from "../sources/finance/index.js";
import { createWebSearchResolver } from "../sources/webSearch/index.js";
import type {
  BioPayload,
  WebSearchResolver,
} from "../sources/webSearch/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const ResearchFinanceParams = Type.Object({
  mode: Type.Union(
    [Type.Literal("candidate"), Type.Literal("challengers")],
    {
      description:
        "'candidate' looks up FEC finance + bio for one federal candidate (requires candidateId or name). " +
        "'challengers' compares each stored rep's filed challengers side-by-side (uses politiclaw_get_my_reps results; supports optional repId+cycle filters).",
    },
  ),
  candidateId: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Used only with mode='candidate'. FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      minLength: 1,
      description:
        "Used only with mode='candidate'. Free-text candidate name query when `candidateId` is absent; returns up to 5 FEC matches for disambiguation.",
    }),
  ),
  cycle: Type.Optional(
    Type.Integer({
      minimum: 1900,
      maximum: 2100,
      description:
        "Optional four-digit election cycle (e.g. 2024). For mode='candidate' filters searches to active candidates for that cycle. For mode='challengers' defaults to the current year if even, otherwise next year.",
    }),
  ),
  office: Type.Optional(
    Type.Union([Type.Literal("H"), Type.Literal("S"), Type.Literal("P")], {
      description:
        "Used only with mode='candidate'. Optional office filter — H (House), S (Senate), P (President).",
    }),
  ),
  state: Type.Optional(
    Type.String({
      pattern: "^[A-Za-z]{2}$",
      description:
        "Used only with mode='candidate'. Optional two-letter state filter (uppercased before the FEC call).",
    }),
  ),
  repId: Type.Optional(
    Type.String({
      description:
        "Used only with mode='challengers'. Focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn.",
    }),
  ),
});

type ResearchFinanceInput = Static<typeof ResearchFinanceParams>;

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

function officeLabel(office?: FederalCandidateRef["office"]): string {
  if (office === "H") return "House";
  if (office === "S") return "Senate";
  if (office === "P") return "President";
  return "unknown office";
}

function formatCandidateHeader(ref: FederalCandidateRef): string {
  const parts: string[] = [`${ref.name} (${officeLabel(ref.office)})`];
  const locationBits: string[] = [];
  if (ref.state) locationBits.push(ref.state);
  if (ref.district && ref.office === "H") locationBits.push(`district ${ref.district}`);
  if (locationBits.length > 0) parts.push(locationBits.join(" "));
  if (ref.party) parts.push(ref.party);
  if (ref.incumbentChallengeStatus) parts.push(ref.incumbentChallengeStatus);
  parts.push(`FEC ${ref.candidateId}`);
  return parts.join(" — ");
}

function formatTotalsLine(row: FederalCandidateFinancialTotals): string[] {
  const coverage = row.coverageEndDate ? ` (through ${row.coverageEndDate})` : "";
  return [
    `Cycle ${row.cycle}${coverage}`,
    `  receipts: ${formatUsd(row.receipts)}`,
    `  disbursements: ${formatUsd(row.disbursements)}`,
    `  cash on hand: ${formatUsd(row.cashOnHandEndPeriod)}`,
    `  individual contributions: ${formatUsd(row.individualContributions)}`,
    `  PAC / committee contributions: ${formatUsd(row.pacContributions)}`,
    `  candidate self-funding: ${formatUsd(row.candidateSelfFunding)}`,
  ];
}

const BIO_VERIFY_DISCLAIMER =
  "Bio narrative above is LLM-search-derived and paraphrases the cited sources. Verify any factual claim against the linked primary source before relying on it.";

export function renderCandidateBio(
  candidateName: string,
  bioResult: AdapterResult<BioPayload>,
): string[] {
  if (bioResult.status !== "ok") {
    return [
      `Bio for ${candidateName}: unavailable — ${bioResult.reason}.` +
        (bioResult.actionable ? ` ${bioResult.actionable}` : ""),
    ];
  }
  const { tier, adapterId, data } = bioResult;
  const lines: string[] = [
    `Bio for ${candidateName} — tier ${tier} (${adapterId}):`,
    `  ${data.narrativeText}`,
  ];
  if (data.structured && Object.keys(data.structured).length > 0) {
    lines.push("  Structured fields:");
    for (const [key, value] of Object.entries(data.structured)) {
      lines.push(`    ${key}: ${value}`);
    }
  }
  if (data.citations.length > 0) {
    lines.push("  Citations:");
    for (const citation of data.citations) {
      const prefix = citation.title ? `${citation.title} — ` : "";
      lines.push(`    - ${prefix}${citation.url}`);
    }
  }
  return lines;
}

export function renderCandidateSummary(
  summary: FederalCandidateFinancialSummary,
  source: { adapterId: string; tier: number },
  bioResult?: AdapterResult<BioPayload>,
): string {
  const lines: string[] = [
    `Candidate finance summary (FEC — tier ${source.tier}, source ${source.adapterId}):`,
    formatCandidateHeader(summary.candidate),
    "",
  ];

  if (summary.totals.length === 0) {
    lines.push(
      "No FEC financial totals available for this candidate yet — either the candidate has no filings, or OpenFEC omitted the cycle.",
    );
  } else {
    for (const row of summary.totals) {
      lines.push(...formatTotalsLine(row));
      lines.push("");
    }
  }

  lines.push(
    "Industry rollups, top donors, and independent expenditures require an OpenSecrets key (optional) — this v1 slice surfaces FEC totals only.",
  );

  if (bioResult) {
    lines.push("");
    lines.push(...renderCandidateBio(summary.candidate.name, bioResult));
  } else {
    lines.push(
      "Bio, voting record, and position statements are not in this output. Use `politiclaw_score_representative` for a sitting member's record.",
    );
  }

  if (bioResult?.status === "ok") {
    lines.push("");
    lines.push(BIO_VERIFY_DISCLAIMER);
  }

  lines.push("");
  lines.push(ALIGNMENT_DISCLAIMER);

  return lines.join("\n");
}

export function renderSearchMatches(
  matches: readonly FederalCandidateRef[],
  query: string,
  source: { adapterId: string; tier: number },
): string {
  if (matches.length === 0) {
    return `No FEC candidates matched "${query}". Try broadening the name or dropping the cycle/office filter.`;
  }

  const lines: string[] = [
    `FEC candidate search for "${query}" (tier ${source.tier}, source ${source.adapterId}):`,
    "",
  ];
  const capped = matches.slice(0, 5);
  for (const match of capped) {
    lines.push(`  • ${formatCandidateHeader(match)}`);
  }
  if (matches.length > capped.length) {
    lines.push(`  … ${matches.length - capped.length} more — narrow with state/office/cycle filters.`);
  }
  lines.push("");
  lines.push(
    "Re-run `politiclaw_research_finance` with mode='candidate' and `candidateId` set to the FEC id above for the full finance summary.",
  );
  return lines.join("\n");
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

let webSearchResolverOverride: WebSearchResolver | null = null;

export function setWebSearchResolverForTests(
  next: WebSearchResolver | null,
): void {
  webSearchResolverOverride = next;
}

function officeHintForBio(
  office: FederalCandidateRef["office"],
): "H" | "S" | "P" | undefined {
  if (office === "H" || office === "S" || office === "P") return office;
  return undefined;
}

export const researchFinanceTool: AnyAgentTool = {
  name: "politiclaw_research_finance",
  label: "Research candidate finance — single candidate or side-by-side challengers",
  description:
    "Federal campaign-finance research from FEC OpenFEC (tier 1). " +
    "Pass mode='candidate' with `candidateId` (e.g. H8CA12345) for a full per-cycle totals summary " +
    "with an attached LLM-search bio; pass `name` for a fuzzy search returning up to 5 FEC matches " +
    "(no bio on the search path — re-run by `candidateId` to pull one). " +
    "Pass mode='challengers' to compare each stored rep's filed challengers side-by-side (uses " +
    "politiclaw_get_my_reps results; supports optional `repId` and `cycle` filters). " +
    "Dollar amounts come only from FEC — industry rollups, donor identities, and independent " +
    "expenditures are out of scope until an OpenSecrets key lands. The bio is tier-5 by default " +
    "and only reaches tier 1/2 when every citation is a primary-government or neutral civic-infrastructure " +
    "domain. Requires plugins.entries.politiclaw.config.apiKeys.apiDataGov (same key as api.congress.gov).",
  parameters: ResearchFinanceParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ResearchFinanceParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const input: ResearchFinanceInput = parsed.data;

    if (input.mode === "candidate") {
      if (!input.candidateId && !input.name) {
        return textResult(
          "Pass either `candidateId` or `name` when mode='candidate'.",
          { status: "invalid" },
        );
      }
      const configuration = getPluginConfig();
      const resolver = createFinanceResolver({
        apiDataGovKey: configuration.apiKeys?.apiDataGov,
      });
      const webSearch = webSearchResolverOverride ?? createWebSearchResolver();
      const normalizedState = input.state?.toUpperCase();

      if (input.candidateId) {
        const result = await resolver.getCandidateSummary(input.candidateId);
        if (result.status !== "ok") {
          const hint = result.actionable ? ` ${result.actionable}` : "";
          return textResult(
            `Candidate research unavailable: ${result.reason}.${hint}`,
            result,
          );
        }
        const candidate = result.data.candidate;
        const bioResult = await webSearch.bio({
          name: candidate.name,
          category: "candidate.bio",
          office: officeHintForBio(candidate.office),
          state: candidate.state,
          district: candidate.district,
          context: "federal candidate bio",
        });
        return textResult(
          renderCandidateSummary(
            result.data,
            { adapterId: result.adapterId, tier: result.tier },
            bioResult,
          ),
          { ...result, bio: bioResult },
        );
      }

      const query = input.name ?? "";
      const searchResult = await resolver.searchCandidates({
        nameQuery: query,
        cycle: input.cycle,
        office: input.office,
        state: normalizedState,
      });
      if (searchResult.status !== "ok") {
        const hint = searchResult.actionable ? ` ${searchResult.actionable}` : "";
        return textResult(
          `Candidate search unavailable: ${searchResult.reason}.${hint}`,
          searchResult,
        );
      }
      return textResult(
        renderSearchMatches(searchResult.data, query, {
          adapterId: searchResult.adapterId,
          tier: searchResult.tier,
        }),
        searchResult,
      );
    }

    // mode === "challengers"
    const { db } = getStorage();
    const configuration = getPluginConfig();
    const resolver = createFinanceResolver({
      apiDataGovKey: configuration.apiKeys?.apiDataGov,
    });

    const result = await compareChallengers(db, resolver, {
      repId: input.repId,
      cycle: input.cycle,
    });

    return textResult(renderResearchChallengersOutput(result), result);
  },
};

export const researchFinanceTools: AnyAgentTool[] = [researchFinanceTool];
