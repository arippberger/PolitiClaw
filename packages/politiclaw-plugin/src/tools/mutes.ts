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
import { parse } from "../validation/typebox.js";

const MuteParams = Type.Object({
  kind: Type.Union(
    MUTE_KINDS.map((kind) => Type.Literal(kind)),
    {
      description:
        "What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug).",
    },
  ),
  ref: Type.String({
    description:
      "The bill id, bioguide id, or issue slug to mute. Issue refs are normalized to lowercase kebab-case.",
  }),
  reason: Type.Optional(
    Type.String({
      description:
        "Optional short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts.",
    }),
  ),
});

const UnmuteParams = Type.Object({
  kind: Type.Union(MUTE_KINDS.map((kind) => Type.Literal(kind))),
  ref: Type.String(),
});

const ListMutesParams = Type.Object({});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function normalizeMuteRefs(raw: unknown): unknown {
  if (typeof raw !== "object" || raw === null) return raw;
  const cast = raw as { ref?: unknown; reason?: unknown };
  return {
    ...raw,
    ref: typeof cast.ref === "string" ? cast.ref.trim() : cast.ref,
    reason: typeof cast.reason === "string" ? cast.reason.trim() : cast.reason,
  };
}

function renderMuteLine(row: MuteRow): string {
  const base = `- [${row.kind}] ${row.ref}`;
  return row.reason ? `${base} — ${row.reason}` : base;
}

export const muteTool: AnyAgentTool = {
  name: "politiclaw_mute",
  label: "Mute a bill, rep, or issue",
  description:
    "Suppress future monitoring alerts for a specific bill, representative, or issue. " +
    "Muting is idempotent — re-muting the same target refreshes the optional reason and timestamp. " +
    "Use when the user says they have seen enough about a topic; they can always unmute later.",
  parameters: MuteParams,
  async execute(_toolCallId, rawParams) {
    // Trim ref/reason before validation so a whitespace-only ref fails
    // validation rather than slipping through to addMute. Mirrors the
    // pre-migration Zod .trim().min(1) behavior.
    const parsed = parse(MuteInputSchema, normalizeMuteRefs(rawParams));
    const { db } = getStorage();
    const row = addMute(db, parsed);
    const reasonSuffix = row.reason ? ` (reason: ${row.reason})` : "";
    return textResult(
      `Muted ${row.kind} '${row.ref}'${reasonSuffix}.`,
      row,
    );
  },
};

export const unmuteTool: AnyAgentTool = {
  name: "politiclaw_unmute",
  label: "Unmute a bill, rep, or issue",
  description:
    "Remove a previously-added mute. Future monitoring alerts will include this target again. " +
    "Returns a no-op acknowledgement if nothing was muted under that (kind, ref).",
  parameters: UnmuteParams,
  async execute(_toolCallId, rawParams) {
    const { kind, ref } = parse(UnmuteInputSchema, normalizeMuteRefs(rawParams));
    const { db } = getStorage();
    const removed = removeMute(db, { kind, ref });
    return textResult(
      removed
        ? `Unmuted ${kind} '${ref}'.`
        : `No mute found for ${kind} '${ref}'.`,
      { removed, kind, ref },
    );
  },
};

export const listMutesTool: AnyAgentTool = {
  name: "politiclaw_list_mutes",
  label: "List current mutes",
  description:
    "Return every active mute entry, newest first. Use to show the user what is currently " +
    "being suppressed from monitoring alerts before unmuting.",
  parameters: ListMutesParams,
  async execute() {
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
  },
};

export const muteTools: AnyAgentTool[] = [muteTool, unmuteTool, listMutesTool];
