import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import {
  attachGeneratedLetter,
  findOpenByTarget,
} from "../domain/actionMoments/index.js";
import {
  draftLetter,
  LETTER_DRAFT_DISCLAIMER,
  LETTER_MAX_WORDS,
  type DraftLetterResult,
  type LetterCitation,
} from "../domain/letters/index.js";
import { createBillsResolver } from "../sources/bills/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DraftLetterParams = Type.Object({
  repId: Type.String({
    description:
      "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
  }),
  issue: Type.String({
    description:
      "Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_set_issue_stance.",
  }),
  billId: Type.Optional(
    Type.String({
      description:
        "Optional canonical bill id ('119-hr-1234'). When present the letter cites the specific bill.",
    }),
  ),
  customNote: Type.Optional(
    Type.String({
      description:
        "Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling.",
    }),
  ),
});

const DraftLetterInputSchema = z.object({
  repId: z.string().trim().min(1),
  issue: z.string().trim().min(1),
  billId: z.string().trim().min(1).optional(),
  customNote: z.string().trim().min(1).optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export function renderDraftLetterOutput(result: DraftLetterResult): string {
  if (result.status === "rep_not_found" || result.status === "no_stance_for_issue") {
    return `Cannot draft: ${result.reason} ${result.actionable}`;
  }
  if (result.status === "bill_unavailable") {
    const tail = result.actionable ? ` ${result.actionable}` : "";
    return `Cannot draft: ${result.reason}${tail}`;
  }
  if (result.status === "over_length") {
    return (
      `Draft rendered at ${result.wordCount} words, over the ${LETTER_MAX_WORDS}-word ceiling. ` +
      "Retry without customNote, or shorten it."
    );
  }

  const { rep, subject, body, citations, wordCount, bill, issue } = result;
  const header = [
    `Draft letter #${result.letterId} to ${rep.name} (${rep.office}) on ${issue}${
      bill ? ` — ${bill.billType} ${bill.number}` : ""
    }.`,
    `Subject: ${subject}`,
    `(${wordCount} words — under ${LETTER_MAX_WORDS}.)`,
  ].join("\n");

  const citationBlock =
    citations.length > 0
      ? ["Citations:", ...citations.map(renderCitationLine)].join("\n")
      : "Citations: none (rep contact url missing from stored record).";

  return [header, "", body, "", citationBlock, "", LETTER_DRAFT_DISCLAIMER].join("\n");
}

function renderCitationLine(c: LetterCitation): string {
  return `  • [${c.label}](${c.url}) — tier ${c.tier}`;
}

export const draftLetterTool: AnyAgentTool = {
  name: "politiclaw_draft_letter",
  label: "Draft a letter to a representative",
  description:
    "Put an accountability question in front of a rep on the user's behalf: a polite, sourced letter " +
    "that states the user's declared stance and asks the rep where they stand on the same issue, " +
    "optionally citing a specific federal bill. Deterministic slot-fill (no LLM). " +
    "Output is copy-paste ready for the user's own email client — PolitiClaw never sends mail; the user sends from their own client. " +
    `Letters are capped at ${LETTER_MAX_WORDS} words and persist in the letters table for audit. ` +
    "Requires a declared stance on the issue (politiclaw_set_issue_stance) and, when citing a bill, " +
    "plugins.politiclaw.apiKeys.apiDataGov for bill lookup.",
  parameters: DraftLetterParams,
  async execute(_toolCallId, rawParams) {
    const parsed = DraftLetterInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = parsed.data.billId
      ? createBillsResolver({
          apiDataGovKey: cfg.apiKeys?.apiDataGov,
          scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
        })
      : undefined;

    const result = await draftLetter(
      db,
      {
        repId: parsed.data.repId,
        issue: parsed.data.issue,
        billId: parsed.data.billId,
        customNote: parsed.data.customNote,
      },
      { resolver },
    );

    if (result.status === "ok") {
      for (const triggerClass of ["bill_nearing_vote", "repeated_misalignment"] as const) {
        const matching = findOpenByTarget(
          db,
          triggerClass,
          result.bill?.id ?? null,
          result.rep.id,
          result.issue,
        );
        for (const pkg of matching) {
          attachGeneratedLetter(db, pkg.id, result.letterId);
        }
      }
    }

    return textResult(renderDraftLetterOutput(result), result);
  },
};

export const letterTools: AnyAgentTool[] = [draftLetterTool];
