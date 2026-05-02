import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import {
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
  billId: Type.String({ description: "Bill id this signal applies to." }),
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
    "Record a single agree/disagree/skip signal from the user on a specific bill. " +
    "Rep scoring reads the latest agree/disagree signal per bill to decide whether a rep's vote was aligned or conflicted. " +
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
