import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import { generateRepReport } from "../domain/reports/repReport.js";
import type { GenerateRepReportResult } from "../domain/reports/repReport.js";
import { renderScoreRepresentativeOutput } from "./repScoring.js";
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
    "PolitiClaw representative alignment report",
    `Stance snapshot hash: ${result.stanceSnapshotHash}`,
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

export const repReportTool: AnyAgentTool = {
  name: "politiclaw_rep_report",
  label: "Monthly-style representative alignment report for all stored reps",
  description:
    "Recomputes alignment for every representative in the reps table (same logic as politiclaw_score_representative) " +
    "and returns one combined report with per-rep sections, congress.gov links for cited bills, and source-tier labels. " +
    "Requires declared issue stances and stored reps. Intended for periodic digests (see politiclaw.rep_report cron template).",
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
