import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  deleteIssueStance,
  IssueStanceSchema,
  listIssueStances,
  listStanceSignals,
  recordStanceSignal,
  upsertIssueStance,
  StanceSignalSchema,
} from "../domain/preferences/index.js";
import { getStorage } from "../storage/context.js";
import { parse } from "../validation/typebox.js";

const RecordStanceSignalParams = Type.Object({
  direction: Type.Union([Type.Literal("agree"), Type.Literal("disagree"), Type.Literal("skip")]),
  source: Type.Union([
    Type.Literal("onboarding"),
    Type.Literal("monitoring"),
    Type.Literal("dashboard"),
  ]),
  issue: Type.Optional(Type.String({ description: "Issue slug, e.g. 'climate'." })),
  billId: Type.Optional(Type.String({ description: "Bill id this signal applies to." })),
  weight: Type.Optional(
    Type.Number({ exclusiveMinimum: 0, description: "Signal strength (> 0); defaults to 1.0." }),
  ),
});

const SetIssueStanceParams = Type.Object({
  issue: Type.String({
    description: "Issue label. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing').",
  }),
  stance: Type.Union([
    Type.Literal("support"),
    Type.Literal("oppose"),
    Type.Literal("neutral"),
  ]),
  weight: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 5,
      description: "How strongly the user cares (1-5). Defaults to 3.",
    }),
  ),
});

const ListIssueStancesParams = Type.Object({});

const DeleteIssueStanceParams = Type.Object({
  issue: Type.String({ description: "Issue slug or label to delete." }),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export const recordStanceSignalTool: AnyAgentTool = {
  name: "politiclaw_record_stance_signal",
  label: "Record PolitiClaw stance signal",
  description:
    "Record a single agree/disagree/skip signal from the user in response to a shown bill or issue. " +
    "Later scoring can aggregate these signals into learned issue stances; this tool only records the raw signal. " +
    "For first-time setup or full reconfiguration, prefer politiclaw_configure.",
  parameters: RecordStanceSignalParams,
  async execute(_toolCallId, rawParams) {
    const validated = parse(StanceSignalSchema, rawParams);
    const { db } = getStorage();
    const id = recordStanceSignal(db, validated);
    return textResult(`Recorded ${validated.direction} signal (#${id}).`, { id });
  },
};

export const setIssueStanceTool: AnyAgentTool = {
  name: "politiclaw_set_issue_stance",
  label: "Set a declared issue stance",
  description:
    "Record the user's declared position (support / oppose / neutral) on a named policy issue, " +
    "with a 1-5 importance weight. Drives bill alignment scoring and rep scoring. " +
    "Re-running with the same issue overwrites the previous stance. " +
    "For first-time setup or full reconfiguration, prefer politiclaw_configure.",
  parameters: SetIssueStanceParams,
  async execute(_toolCallId, rawParams) {
    const validated = parse(IssueStanceSchema, rawParams);
    const { db } = getStorage();
    const row = upsertIssueStance(db, validated);
    return textResult(
      `Saved ${row.stance} stance on '${row.issue}' (weight ${row.weight}).`,
      row,
    );
  },
};

export const listIssueStancesTool: AnyAgentTool = {
  name: "politiclaw_list_issue_stances",
  label: "List declared issue stances",
  description:
    "Return every declared issue stance, ordered by weight (high to low). Use to show " +
    "the user what PolitiClaw is scoring bills and reps against. " +
    "For first-time setup or full reconfiguration, prefer politiclaw_configure.",
  parameters: ListIssueStancesParams,
  async execute() {
    const { db } = getStorage();
    const rows = listIssueStances(db);
    if (rows.length === 0) {
      return textResult(
        "No issue stances set yet. Use politiclaw_set_issue_stance to declare one.",
        { stances: [] },
      );
    }
    const lines = rows.map(
      (row) => `- ${row.issue}: ${row.stance} (weight ${row.weight})`,
    );
    return textResult(["Issue stances:", ...lines].join("\n"), { stances: rows });
  },
};

export const deleteIssueStanceTool: AnyAgentTool = {
  name: "politiclaw_delete_issue_stance",
  label: "Delete a declared issue stance",
  description:
    "Remove a single declared issue stance by issue slug or label. " +
    "For first-time setup or full reconfiguration, prefer politiclaw_configure.",
  parameters: DeleteIssueStanceParams,
  async execute(_toolCallId, rawParams) {
    const { issue } = rawParams as { issue: string };
    const { db } = getStorage();
    const deleted = deleteIssueStance(db, issue);
    return textResult(
      deleted
        ? `Deleted issue stance '${issue.trim().toLowerCase()}'.`
        : `No issue stance found for '${issue}'.`,
      { deleted },
    );
  },
};

export const politiclawTools: AnyAgentTool[] = [
  recordStanceSignalTool,
  setIssueStanceTool,
  listIssueStancesTool,
  deleteIssueStanceTool,
];

export { listStanceSignals };
