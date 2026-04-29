import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  addMute,
  listMutes,
  MUTE_KINDS,
  MuteInputSchema,
  removeMute,
  UnmuteInputSchema,
  type MuteRow,
} from "../domain/mutes/index.js";
import { getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const MutesParams = Type.Object({
  action: Type.Union(
    [Type.Literal("add"), Type.Literal("remove"), Type.Literal("list")],
    {
      description:
        "What to do: 'add' to start suppressing a target, 'remove' to unsuppress, 'list' to see every active mute. " +
        "'add' and 'remove' both require kind+ref; 'list' takes no other params.",
    },
  ),
  kind: Type.Optional(
    Type.Union(MUTE_KINDS.map((kind) => Type.Literal(kind)), {
      description:
        "Required for action='add' or action='remove'. What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug).",
    }),
  ),
  ref: Type.Optional(
    Type.String({
      description:
        "Required for action='add' or action='remove'. Bill id, bioguide id, or issue slug. Issue refs are normalized to lowercase kebab-case.",
    }),
  ),
  reason: Type.Optional(
    Type.String({
      description:
        "Optional (action='add' only). Short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function renderMuteLine(row: MuteRow): string {
  const base = `- [${row.kind}] ${row.ref}`;
  return row.reason ? `${base} — ${row.reason}` : base;
}

export const mutesTool: AnyAgentTool = {
  name: "politiclaw_mutes",
  label: "Manage monitoring alert mutes (add, remove, list)",
  description:
    "Manage suppression of monitoring alerts for specific bills, reps, or issues. " +
    "Pass action='add' with kind+ref (and optional reason) to start suppressing — re-adding " +
    "the same target refreshes the optional reason and timestamp. Pass action='remove' with " +
    "kind+ref to unsuppress. Pass action='list' for every active mute, newest first. " +
    "Prefer politiclaw_action_moments with verdict='not_now' or 'stop' when you only want to " +
    "dismiss a single offer rather than silence the bill/rep/issue entirely.",
  parameters: MutesParams,
  async execute(_toolCallId, rawParams) {
    const parsedParams = safeParse(MutesParams, rawParams ?? {});
    if (!parsedParams.ok) {
      return textResult(
        `Invalid input: ${parsedParams.messages.join("; ")}`,
        { status: "invalid" },
      );
    }
    const params = parsedParams.data;
    const action = params.action;

    if (action === "list") {
      const { db } = getStorage();
      const rows = listMutes(db);
      if (rows.length === 0) {
        return textResult("No mutes set.", { mutes: [] });
      }
      const lines = rows.map(renderMuteLine);
      return textResult(
        [`Muted ${rows.length} item${rows.length === 1 ? "" : "s"}:`, ...lines].join("\n"),
        { mutes: rows },
      );
    }

    if (action === "add") {
      const ref = trimString(params.ref);
      const reason = trimString(params.reason);
      if (!params.kind) {
        return textResult(
          "Cannot add mute: 'kind' is required when action='add'.",
          { status: "invalid" },
        );
      }
      if (!ref) {
        return textResult(
          "Cannot add mute: 'ref' is required when action='add'.",
          { status: "invalid" },
        );
      }
      const parsed = safeParse(MuteInputSchema, {
        kind: params.kind,
        ref,
        ...(reason !== undefined ? { reason } : {}),
      });
      if (!parsed.ok) {
        return textResult(
          `Invalid input: ${parsed.messages.join("; ")}`,
          { status: "invalid" },
        );
      }
      const { db } = getStorage();
      const row = addMute(db, parsed.data);
      const reasonSuffix = row.reason ? ` (reason: ${row.reason})` : "";
      return textResult(
        `Muted ${row.kind} '${row.ref}'${reasonSuffix}.`,
        row,
      );
    }

    if (action === "remove") {
      const ref = trimString(params.ref);
      if (!params.kind) {
        return textResult(
          "Cannot remove mute: 'kind' is required when action='remove'.",
          { status: "invalid" },
        );
      }
      if (!ref) {
        return textResult(
          "Cannot remove mute: 'ref' is required when action='remove'.",
          { status: "invalid" },
        );
      }
      const parsed = safeParse(UnmuteInputSchema, {
        kind: params.kind,
        ref,
      });
      if (!parsed.ok) {
        return textResult(
          `Invalid input: ${parsed.messages.join("; ")}`,
          { status: "invalid" },
        );
      }
      const { kind, ref: parsedRef } = parsed.data;
      const { db } = getStorage();
      const removed = removeMute(db, { kind, ref: parsedRef });
      return textResult(
        removed
          ? `Unmuted ${kind} '${parsedRef}'.`
          : `No mute found for ${kind} '${parsedRef}'.`,
        { removed, kind, ref: parsedRef },
      );
    }

    return textResult(
      `Invalid action. Pass action: 'add' | 'remove' | 'list'.`,
      { status: "invalid" },
    );
  },
};

export const muteTools: AnyAgentTool[] = [mutesTool];
