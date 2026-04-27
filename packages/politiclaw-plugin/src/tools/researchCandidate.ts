import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

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
import { getPluginConfig } from "../storage/context.js";

const ResearchCandidateParams = Type.Object({
  candidateId: Type.Optional(
    Type.String({
      description:
        "FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint.",
    }),
  ),
  name: Type.Optional(
    Type.String({
      description:
        "Free-text candidate name query. Used when `candidateId` is absent; returns up to 5 FEC candidate matches for disambiguation.",
    }),
  ),
  cycle: Type.Optional(
    Type.Integer({
      description:
        "Optional four-digit election cycle (e.g. 2024) to filter searches to active candidates for that cycle.",
    }),
  ),
  office: Type.Optional(
    Type.Union([Type.Literal("H"), Type.Literal("S"), Type.Literal("P")], {
      description: "Optional office filter — H (House), S (Senate), P (President).",
    }),
  ),
  state: Type.Optional(
    Type.String({
      description: "Optional two-letter state filter (uppercased before the FEC call).",
    }),
  ),
});

const ResearchCandidateInputSchema = z
  .object({
    candidateId: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1).optional(),
    cycle: z
      .number()
      .int()
      .min(1900)
      .max(2100)
      .optional(),
    office: z.enum(["H", "S", "P"]).optional(),
    state: z
      .string()
      .trim()
      .length(2)
      .transform((value) => value.toUpperCase())
      .optional(),
  })
  .refine((input) => Boolean(input.candidateId ?? input.name), {
    message: "Pass either `candidateId` or `name`.",
  });

type ResearchCandidateInput = z.infer<typeof ResearchCandidateInputSchema>;

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatUsd(value: number | null): string {
  if (value === null) return "no data";
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

/**
 * Appended whenever a bio narrative was rendered. The bio narrative itself
 * is an LLM paraphrase of primary sources even at tier 1/2, so the
 * verify-against-official-source line ships every time.
 */
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
    "Re-run `politiclaw_research_candidate` with `candidateId` set to the FEC id above for the full finance summary.",
  );
  return lines.join("\n");
}

/**
 * Test seam: override the web-search resolver used by the tool so specs can
 * exercise the bio-attached candidateId branch without wiring a global
 * transport. Production leaves this unset — the tool then builds a fetcher-
 * less resolver which returns `unavailable` and degrades to FEC-only output.
 */
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

export const researchCandidateTool: AnyAgentTool = {
  name: "politiclaw_research_candidate",
  label: "Look up FEC candidate finance totals + tier-5 bio",
  description:
    "Research a federal candidate (President, Senate, House) via FEC OpenFEC plus an " +
    "optional LLM-search bio. Pass `candidateId` (e.g. H8CA12345) for a full per-cycle totals " +
    "summary with an attached bio; pass `name` for a fuzzy search that returns up to 5 FEC " +
    "matches (no bio on the search path — re-run by `candidateId` to pull one). Dollar amounts " +
    "come only from FEC (tier 1) — industry rollups, donor identities, and independent " +
    "expenditures are intentionally out of scope until an OpenSecrets key lands. The bio is " +
    "tier-5 by default and only reaches tier 1/2 when every citation is a primary-government " +
    "or neutral civic-infrastructure domain. Requires plugins.politiclaw.apiKeys.apiDataGov " +
    "(same key as api.congress.gov).",
  parameters: ResearchCandidateParams,
  async execute(_toolCallId, rawParams) {
    const parsed = ResearchCandidateInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const input: ResearchCandidateInput = parsed.data;
    const configuration = getPluginConfig();
    const resolver = createFinanceResolver({
      apiDataGovKey: configuration.apiKeys?.apiDataGov,
    });
    const webSearch = webSearchResolverOverride ?? createWebSearchResolver();

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
      state: input.state,
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
  },
};

export const researchCandidateTools: AnyAgentTool[] = [researchCandidateTool];
