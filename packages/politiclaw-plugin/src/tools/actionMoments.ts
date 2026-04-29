import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  getActionPackage,
  listOpenActionPackages,
  recordPackageFeedback,
  type ActionPackageRow,
  type PackageFeedbackVerdict,
} from "../domain/actionMoments/index.js";
import { getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const ActionMomentsParams = Type.Object({
  action: Type.Union(
    [Type.Literal("list"), Type.Literal("dismiss")],
    {
      description:
        "What to do: 'list' returns open action packages (no other params required); " +
        "'dismiss' records user feedback on a single package (requires packageId and verdict).",
    },
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description: "Used only with action='list'. Max packages to return. Defaults to 25.",
    }),
  ),
  packageId: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Required for action='dismiss'. Action package id to dismiss.",
    }),
  ),
  verdict: Type.Optional(
    Type.Union(
      [Type.Literal("useful"), Type.Literal("not_now"), Type.Literal("stop")],
      {
        description:
          "Required for action='dismiss'. useful = used it. not_now = hide for 7 days. stop = never offer this target again.",
      },
    ),
  ),
  note: Type.Optional(
    Type.String({
      description:
        "Optional (action='dismiss' only). Free-text reason — stored verbatim for later review.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function renderPackageLine(pkg: ActionPackageRow): string {
  const tail = pkg.packageKind === "outreach" ? ` (${pkg.outreachMode ?? "outreach"})` : "";
  return `  • #${pkg.id} [${pkg.triggerClass}]${tail} — ${pkg.summary}`;
}

export const actionMomentsTool: AnyAgentTool = {
  name: "politiclaw_action_moments",
  label: "List or dismiss open action-package offers",
  description:
    "Manage the open action packages — outreach drafts (letter/call), reminders, and " +
    "election-prep prompts — that the classifier has queued as optional offers. " +
    "Pass action='list' (no other params required) to see what is currently queued; the list " +
    "is offer-not-push, nothing has been sent. Pass action='dismiss' with packageId and verdict " +
    "to record feedback: verdict='useful' marks it used, 'not_now' suppresses the same target " +
    "for 7 days, 'stop' permanently stops offering packages for the same (trigger, target). " +
    "Prefer this over politiclaw_mutes unless the user explicitly wants to silence the bill/rep/issue.",
  parameters: ActionMomentsParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(ActionMomentsParams, rawParams ?? {});
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
        { status: "invalid" },
      );
    }
    const { db } = getStorage();

    if (parsed.data.action === "list") {
      const rows = listOpenActionPackages(db, { limit: parsed.data.limit ?? 25 });
      if (rows.length === 0) {
        return textResult("No open action moments.", { status: "ok", packages: [] });
      }
      const lines = ["Open action moments:", ...rows.map(renderPackageLine)];
      return textResult(lines.join("\n"), { status: "ok", packages: rows });
    }

    // action === "dismiss"
    const packageId = parsed.data.packageId;
    const verdict = parsed.data.verdict;
    if (typeof packageId !== "number" || verdict === undefined) {
      return textResult(
        "Cannot dismiss: 'packageId' and 'verdict' are required when action='dismiss'.",
        { status: "invalid" },
      );
    }

    const pkg = getActionPackage(db, packageId);
    if (!pkg) {
      return textResult(`No action package with id ${packageId}.`, {
        status: "not_found",
      });
    }
    const result = recordPackageFeedback(db, {
      packageId,
      verdict: verdict as PackageFeedbackVerdict,
      note: parsed.data.note,
    });
    if (result.status === "not_found") {
      return textResult(result.reason, { status: "not_found" });
    }
    const messages: Record<PackageFeedbackVerdict, string> = {
      useful: `Marked package #${packageId} as used.`,
      not_now: "OK, hiding this one for now.",
      stop: "OK, won't offer this one again.",
    };
    return textResult(messages[verdict as PackageFeedbackVerdict], {
      status: "ok",
      package: result.package,
    });
  },
};

export const actionMomentsTools: AnyAgentTool[] = [actionMomentsTool];
