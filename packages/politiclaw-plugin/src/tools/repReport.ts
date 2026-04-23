import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import { generateRepReport } from "../domain/reports/repReport.js";
import type { GenerateRepReportResult, RepReportRow } from "../domain/reports/repReport.js";
import { computeRepPattern, renderScoreRepresentativeOutput, type RepPattern } from "./repScoring.js";
import { getStorage } from "../storage/context.js";

const RepReportParams = Type.Object({
  includeProcedural: Type.Optional(
    Type.Boolean({
      description:
        "When true, procedural House roll calls are INCLUDED in scoring (same semantics as politiclaw_score_representative). Default is false.",
    }),
  ),
});

const RepReportInputSchema = z.object({
  includeProcedural: z.boolean().optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export function renderRepReportDocument(result: GenerateRepReportResult): string {
  if (result.status === "no_stances") {
    return `Cannot produce rep report: ${result.reason}. ${result.actionable}.`;
  }
  if (result.status === "no_reps") {
    return `Cannot produce rep report: ${result.reason}. ${result.actionable}.`;
  }

  const blocks: string[] = [
    "PolitiClaw representative accountability report",
    `Stance snapshot hash: ${result.stanceSnapshotHash}`,
    formatPatternTally(result.rows),
    "",
    "Federal bill links resolve to congress.gov (tier 1 government source).",
    "",
  ];

  for (let index = 0; index < result.rows.length; index++) {
    if (index > 0) {
      blocks.push("", "---", "");
    }
    blocks.push(renderScoreRepresentativeOutput(result.rows[index]!.result));
  }

  return blocks.join("\n");
}

function formatPatternTally(rows: readonly RepReportRow[]): string {
  const counts: Record<RepPattern, number> = {
    aligned: 0,
    mixed: 0,
    concerning: 0,
    insufficient_data: 0,
  };
  for (const row of rows) {
    const res = row.result;
    if (res.status !== "ok") {
      counts.insufficient_data += 1;
      continue;
    }
    counts[computeRepPattern(res.perIssue)] += 1;
  }
  return (
    `Patterns: ${counts.aligned} aligned · ${counts.mixed} mixed · ` +
    `${counts.concerning} concerning · ${counts.insufficient_data} insufficient data.`
  );
}

export const repReportTool: AnyAgentTool = {
  name: "politiclaw_rep_report",
  label: "Did your delegation represent the stances you declared?",
  description:
    "Canonical accountability surface across your full stored delegation. Recomputes per-issue " +
    "alignment for every rep (same deterministic logic as politiclaw_score_representative), tags " +
    "each rep with a 3-band accountability pattern (aligned / mixed / concerning / insufficient " +
    "data), and returns one combined document with a pattern tally, per-rep sections, " +
    "congress.gov links for cited bills, and source-tier labels. Requires declared issue stances " +
    "and stored reps. Intended for periodic digests (see politiclaw.rep_report cron template).",
  parameters: RepReportParams,
  async execute(_toolCallId, rawParams) {
    const parsed = RepReportInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const generated = generateRepReport(db, {
      excludeProcedural: parsed.data.includeProcedural !== true,
    });
    return textResult(renderRepReportDocument(generated), generated);
  },
};

export const repReportTools: AnyAgentTool[] = [repReportTool];
