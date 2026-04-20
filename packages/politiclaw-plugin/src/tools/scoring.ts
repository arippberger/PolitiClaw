import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import {
  ALIGNMENT_DISCLAIMER,
  CONFIDENCE_FLOOR,
  scoreBill,
  type ScoreBillResult,
} from "../domain/scoring/index.js";
import { createBillsResolver } from "../sources/bills/index.js";
import type { BillRef } from "../sources/bills/types.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const BILL_TYPES = [
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
] as const;

const BILL_ID_REGEX = /^(\d{2,4})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/i;

const ScoreBillParams = Type.Object({
  billId: Type.Optional(
    Type.String({
      description:
        "Canonical bill id: '<congress>-<billType>-<number>', e.g. '119-hr-1234'.",
    }),
  ),
  congress: Type.Optional(Type.Integer({ minimum: 1 })),
  billType: Type.Optional(Type.String()),
  number: Type.Optional(Type.String()),
  refresh: Type.Optional(
    Type.Boolean({ description: "When true, bypass the bill-detail cache and re-fetch." }),
  ),
});

const ScoreBillInputSchema = z
  .object({
    billId: z.string().trim().min(1).optional(),
    congress: z.number().int().positive().optional(),
    billType: z.string().trim().min(1).optional(),
    number: z.string().trim().min(1).optional(),
    refresh: z.boolean().optional(),
  })
  .refine(
    (input) =>
      Boolean(input.billId) ||
      (input.congress !== undefined && input.billType && input.number),
    { message: "provide billId, or congress + billType + number" },
  );

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function normalizeBillType(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  return (BILL_TYPES as readonly string[]).includes(upper) ? upper : null;
}

function parseBillRef(input: {
  billId?: string;
  congress?: number;
  billType?: string;
  number?: string;
}): BillRef | null {
  if (input.billId) {
    const match = BILL_ID_REGEX.exec(input.billId.trim());
    if (!match) return null;
    return {
      congress: Number(match[1]),
      billType: match[2]!.toUpperCase(),
      number: match[3]!,
    };
  }
  if (input.congress !== undefined && input.billType && input.number) {
    const billType = normalizeBillType(input.billType);
    if (!billType) return null;
    return { congress: input.congress, billType, number: input.number };
  }
  return null;
}

/**
 * Render a scoring result as text. Enforces two output rules:
 *   - confidence < 0.4 renders as "insufficient data" (raw numbers are kept
 *     in `details` for audit but hidden from prose)
 *   - every position-adjacent output includes ALIGNMENT_DISCLAIMER verbatim
 */
export function renderScoreBillOutput(result: ScoreBillResult): string {
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` (${result.actionable})` : "";
    return `Bill unavailable: ${result.reason}.${hint}`;
  }
  if (result.status === "no_stances") {
    return `Cannot score: ${result.reason}. ${result.actionable}.`;
  }

  const { bill, alignment, source } = result;
  const header = `Bill ${bill.congress} ${bill.billType} ${bill.number} — ${bill.title}`;
  const provenance = `Source: ${source.adapterId} (tier ${source.tier}).`;

  if (alignment.belowConfidenceFloor) {
    return [
      header,
      provenance,
      "Alignment: insufficient data (confidence below floor; cannot honestly label this bill against your stances).",
      alignment.rationale,
      "",
      ALIGNMENT_DISCLAIMER,
    ].join("\n");
  }

  const relevancePct = Math.round(alignment.relevance * 100);
  const confidencePct = Math.round(alignment.confidence * 100);
  const matchLines =
    alignment.matches.length > 0
      ? alignment.matches.map(
          (m) =>
            `  • ${m.issue} (${m.stance}, weight ${m.stanceWeight}) via ${m.matchedText}`,
        )
      : ["  • (no declared-stance matches on this bill)"];

  return [
    header,
    provenance,
    `Relevance to your stances: ${relevancePct}% (confidence ${confidencePct}%).`,
    "Matches:",
    ...matchLines,
    "",
    alignment.rationale,
    "",
    ALIGNMENT_DISCLAIMER,
  ].join("\n");
}

export const scoreBillTool: AnyAgentTool = {
  name: "politiclaw_score_bill",
  label: "Score a bill against your declared stances",
  description:
    "Compute how much a federal bill touches the user's declared issue stances. " +
    "Deterministic (no LLM): matches policy area, subjects, title, and summary against " +
    "each declared stance. Reports relevance and confidence; confidence below the " +
    `${CONFIDENCE_FLOOR} floor renders as "insufficient data". ` +
    "Rationale names specific matched subjects (never abstract generalities). " +
    "Requires declared issue stances (see politiclaw_set_issue_stance) and " +
    "plugins.politiclaw.apiKeys.apiDataGov for the bill source.",
  parameters: ScoreBillParams,
  async execute(_toolCallId, rawParams) {
    const parsed = ScoreBillInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const ref = parseBillRef(parsed.data);
    if (!ref) {
      return textResult(
        "Could not parse bill reference. Use billId like '119-hr-1234' or congress + billType + number.",
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createBillsResolver({ apiDataGovKey: cfg.apiKeys?.apiDataGov });

    const result = await scoreBill(db, resolver, ref, { refresh: parsed.data.refresh });
    return textResult(renderScoreBillOutput(result), result);
  },
};

export const scoringTools: AnyAgentTool[] = [scoreBillTool];
