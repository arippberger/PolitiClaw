import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
  listStanceSignals,
  recordStanceSignal,
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

export const recordStanceSignalTools: AnyAgentTool[] = [recordStanceSignalTool];

export { listStanceSignals };
