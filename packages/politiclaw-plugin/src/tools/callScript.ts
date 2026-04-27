import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import { findOpenByTarget, attachGeneratedCallScript } from "../domain/actionMoments/index.js";
import {
  CALL_SCRIPT_DISCLAIMER,
  CALL_SCRIPT_MAX_WORDS,
  draftCallScript,
  type DraftCallScriptResult,
} from "../domain/outreach/callScript.js";
import { createBillsResolver } from "../sources/bills/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DraftCallScriptParams = Type.Object({
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
        "Optional canonical bill id ('119-hr-1234'). When present the script cites the specific bill.",
    }),
  ),
  oneSpecificSentence: Type.Optional(
    Type.String({
      description:
        "Optional single sentence the user wants to say in their own words. Appended verbatim after the ask line. Keep it short — the script is capped at 150 words.",
    }),
  ),
});

const DraftCallScriptInputSchema = z.object({
  repId: z.string().trim().min(1),
  issue: z.string().trim().min(1),
  billId: z.string().trim().min(1).optional(),
  oneSpecificSentence: z.string().trim().min(1).optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
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

export const draftCallScriptTool: AnyAgentTool = {
  name: "politiclaw_draft_call_script",
  label: "Draft a short call script for a rep's office",
  description:
    "Draft a ≤150-word call script the user can read to their rep's office on a declared " +
    "issue, optionally citing a specific federal bill. Deterministic slot-fill (no LLM). " +
    "Phone numbers come from the stored rep contact record — never invented. PolitiClaw " +
    "never dials; the output is copy-paste ready for the user. Requires a declared stance " +
    "(politiclaw_set_issue_stance) and, when citing a bill, plugins.politiclaw.apiKeys.apiDataGov.",
  parameters: DraftCallScriptParams,
  async execute(_toolCallId, rawParams) {
    const parsed = DraftCallScriptInputSchema.safeParse(rawParams);
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

    const result = await draftCallScript(
      db,
      {
        repId: parsed.data.repId,
        issue: parsed.data.issue,
        billId: parsed.data.billId,
        oneSpecificSentence: parsed.data.oneSpecificSentence,
      },
      { resolver },
    );

    if (result.status === "ok") {
      for (const triggerClass of ["bill_nearing_vote", "repeated_misalignment"] as const) {
        const matching = findOpenByTarget(
          db,
          triggerClass,
          parsed.data.billId ?? null,
          parsed.data.repId,
          parsed.data.issue,
        );
        for (const pkg of matching) {
          attachGeneratedCallScript(db, pkg.id, result.callScriptId);
        }
      }
    }

    return textResult(renderDraftCallScriptOutput(result), result);
  },
};

export const callScriptTools: AnyAgentTool[] = [draftCallScriptTool];
