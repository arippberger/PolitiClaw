import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  attachGeneratedCallScript,
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
import {
  CALL_SCRIPT_DISCLAIMER,
  CALL_SCRIPT_MAX_WORDS,
  draftCallScript,
  type DraftCallScriptResult,
} from "../domain/outreach/callScript.js";
import { createBillsResolver } from "../sources/bills/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const DraftOutreachParams = Type.Object({
  format: Type.Union(
    [Type.Literal("letter"), Type.Literal("call")],
    {
      description:
        "'letter' produces a copy-paste-ready email-style letter (≤" +
        `${LETTER_MAX_WORDS} words). ` +
        "'call' produces a short phone-call script (≤" +
        `${CALL_SCRIPT_MAX_WORDS} words) with the rep's office phone number from the stored record.`,
    },
  ),
  repId: Type.String({
    description:
      "Stable rep id (bioguide when available). Call politiclaw_get_my_reps first to look it up.",
  }),
  issue: Type.String({
    description:
      "Issue slug from your declared stances (e.g. 'affordable-housing'). Must already be set via politiclaw_issue_stances.",
  }),
  billId: Type.Optional(
    Type.String({
      description:
        "Optional canonical bill id ('119-hr-1234'). When present the draft cites the specific bill.",
    }),
  ),
  customNote: Type.Optional(
    Type.String({
      description:
        "Used only with format='letter'. Optional one-sentence personal hook appended verbatim above the closing. Keep short — the draft is already near its word ceiling.",
    }),
  ),
  oneSpecificSentence: Type.Optional(
    Type.String({
      description:
        "Used only with format='call'. Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at " +
        `${CALL_SCRIPT_MAX_WORDS} words.`,
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function renderCitationLine(citation: LetterCitation): string {
  return `  • [${citation.label}](${citation.url}) — tier ${citation.tier}`;
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

export function renderDraftCallScriptOutput(result: DraftCallScriptResult): string {
  if (result.status === "rep_not_found" || result.status === "no_stance_for_issue") {
    return `Cannot draft: ${result.reason} ${result.actionable}`;
  }
  if (result.status === "bill_unavailable") {
    const tail = result.actionable ? ` ${result.actionable}` : "";
    return `Cannot draft: ${result.reason}${tail}`;
  }
  if (result.status === "no_phone_on_file") {
    return `Cannot draft: ${result.reason} ${result.actionable}`;
  }
  if (result.status === "over_length") {
    return (
      `Draft rendered at ${result.wordCount} words, over the ${CALL_SCRIPT_MAX_WORDS}-word ceiling. ` +
      "Retry without oneSpecificSentence, or shorten it."
    );
  }

  const { rep, issue, bill, phoneNumber, wordCount, script } = result;
  const header = [
    `Call script #${result.callScriptId} for ${rep.name} (${rep.office}) on ${issue}${
      bill ? ` — ${bill.billType} ${bill.number}` : ""
    }.`,
    phoneNumber ? `Phone: ${phoneNumber}` : "Phone: (not on file)",
    `(${wordCount} words — under ${CALL_SCRIPT_MAX_WORDS}.)`,
  ].join("\n");

  return [header, "", script, "", CALL_SCRIPT_DISCLAIMER].join("\n");
}

export const draftOutreachTool: AnyAgentTool = {
  name: "politiclaw_draft_outreach",
  label: "Draft a letter or call script for a representative",
  description:
    "Put an accountability question in front of a rep on the user's behalf. " +
    "Pass format='letter' for a polite, sourced copy-paste-ready email-style letter " +
    `(≤${LETTER_MAX_WORDS} words) — supports an optional customNote. ` +
    "Pass format='call' for a short phone-call script " +
    `(≤${CALL_SCRIPT_MAX_WORDS} words) using the rep's office phone number from the stored record — ` +
    "supports an optional oneSpecificSentence. Both formats are deterministic slot-fill (no LLM) and " +
    "require a declared stance on the issue (politiclaw_issue_stances). Output is copy-paste ready " +
    "for the user's own client — PolitiClaw never sends or dials. Drafts persist in their respective " +
    "tables for audit. Citing a bill requires plugins.entries.politiclaw.config.apiKeys.apiDataGov for bill lookup.",
  parameters: DraftOutreachParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(DraftOutreachParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }

    const { format, repId, issue, billId, customNote, oneSpecificSentence } = parsed.data;

    if (format === "letter" && oneSpecificSentence !== undefined) {
      return textResult(
        "Invalid input: 'oneSpecificSentence' applies only to format='call'. " +
        "For format='letter', use 'customNote' instead.",
        { status: "invalid" },
      );
    }
    if (format === "call" && customNote !== undefined) {
      return textResult(
        "Invalid input: 'customNote' applies only to format='letter'. " +
        "For format='call', use 'oneSpecificSentence' instead.",
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = billId
      ? createBillsResolver({
          apiDataGovKey: cfg.apiKeys?.apiDataGov,
          scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
        })
      : undefined;

    if (format === "letter") {
      const result = await draftLetter(
        db,
        { repId, issue, billId, customNote },
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
    }

    // format === "call"
    const result = await draftCallScript(
      db,
      { repId, issue, billId, oneSpecificSentence },
      { resolver },
    );

    if (result.status === "ok") {
      for (const triggerClass of ["bill_nearing_vote", "repeated_misalignment"] as const) {
        const matching = findOpenByTarget(
          db,
          triggerClass,
          billId ?? null,
          repId,
          issue,
        );
        for (const pkg of matching) {
          attachGeneratedCallScript(db, pkg.id, result.callScriptId);
        }
      }
    }

    return textResult(renderDraftCallScriptOutput(result), result);
  },
};

export const draftOutreachTools: AnyAgentTool[] = [draftOutreachTool];
