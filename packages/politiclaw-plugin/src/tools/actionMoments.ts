import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import {
  getActionPackage,
  listOpenActionPackages,
  recordPackageFeedback,
  type ActionPackageRow,
  type PackageFeedbackVerdict,
} from "../domain/actionMoments/index.js";
import { getStorage } from "../storage/context.js";

const ListActionMomentsParams = Type.Object({
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Max packages to return. Defaults to 25.",
    }),
  ),
});

const ListActionMomentsInputSchema = z.object({
  limit: z.number().int().min(1).max(100).optional(),
});

const DismissPackageParams = Type.Object({
  packageId: Type.Integer({
    minimum: 1,
    description: "Action package id to dismiss.",
  }),
  verdict: Type.Union(
    [Type.Literal("useful"), Type.Literal("not_now"), Type.Literal("stop")],
    {
      description:
        "useful = used it. not_now = hide for 7 days. stop = never offer this target again.",
    },
  ),
  note: Type.Optional(
    Type.String({
      description: "Optional free-text reason — stored verbatim for later review.",
    }),
  ),
});

const DismissPackageInputSchema = z.object({
  packageId: z.number().int().positive(),
  verdict: z.enum(["useful", "not_now", "stop"]),
  note: z.string().trim().min(1).optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function renderPackageLine(pkg: ActionPackageRow): string {
  const tail = pkg.packageKind === "outreach" ? ` (${pkg.outreachMode ?? "outreach"})` : "";
  return `  • #${pkg.id} [${pkg.triggerClass}]${tail} — ${pkg.summary}`;
}

export const listActionMomentsTool: AnyAgentTool = {
  name: "politiclaw_list_action_moments",
  label: "List open action-package offers",
  description:
    "Return the set of open action packages — outreach drafts (letter/call), reminders, " +
    "and election-prep prompts — that the classifier has queued as optional offers. The " +
    "list is offer-not-push: nothing here has been sent, and the user can dismiss each " +
    "with politiclaw_dismiss_action_package.",
  parameters: ListActionMomentsParams,
  execute: async (_toolCallId, rawParams) => {
    const parsed = ListActionMomentsInputSchema.safeParse(rawParams ?? {});
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }
    const { db } = getStorage();
    const rows = listOpenActionPackages(db, { limit: parsed.data.limit ?? 25 });
    if (rows.length === 0) {
      return textResult("No open action moments.", { status: "ok", packages: [] });
    }
    const lines = ["Open action moments:", ...rows.map(renderPackageLine)];
    return textResult(lines.join("\n"), { status: "ok", packages: rows });
  },
};

export const dismissActionPackageTool: AnyAgentTool = {
  name: "politiclaw_dismiss_action_package",
  label: "Dismiss or flag an action package",
  description:
    "Record user feedback on an action package. verdict='useful' marks it used, " +
    "'not_now' suppresses the same target for 7 days, 'stop' permanently stops " +
    "offering packages for the same (trigger, target tuple). Prefer this over " +
    "politiclaw_mute unless the user explicitly wants to silence the bill/rep/issue.",
  parameters: DismissPackageParams,
  execute: async (_toolCallId, rawParams) => {
    const parsed = DismissPackageInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }
    const { db } = getStorage();
    const pkg = getActionPackage(db, parsed.data.packageId);
    if (!pkg) {
      return textResult(`No action package with id ${parsed.data.packageId}.`, {
        status: "not_found",
      });
    }
    const result = recordPackageFeedback(db, {
      packageId: parsed.data.packageId,
      verdict: parsed.data.verdict as PackageFeedbackVerdict,
      note: parsed.data.note,
    });
    if (result.status === "not_found") {
      return textResult(result.reason, { status: "not_found" });
    }
    const messages: Record<PackageFeedbackVerdict, string> = {
      useful: `Marked package #${parsed.data.packageId} as used.`,
      not_now: "OK, hiding this one for now.",
      stop: "OK, won't offer this one again.",
    };
    return textResult(messages[parsed.data.verdict], {
      status: "ok",
      package: result.package,
    });
  },
};

export const actionMomentsTools: AnyAgentTool[] = [
  listActionMomentsTool,
  dismissActionPackageTool,
];
