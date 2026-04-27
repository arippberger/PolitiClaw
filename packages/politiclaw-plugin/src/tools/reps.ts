import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { identifyMyReps } from "../domain/reps/index.js";
import { createRepsResolver } from "../sources/reps/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const GetMyRepsParams = Type.Object({
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "When true, bypass the cache and re-fetch from the source adapter. Default: false.",
    }),
  ),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatRepLocation(rep: {
  office: string;
  state?: string;
  district?: string;
}): string {
  const fallbackState = "Unknown state";
  if (rep.office === "US House") {
    const state = rep.state ?? fallbackState;
    const district = rep.district ?? "Unknown district";
    return `${state}-${district}`;
  }
  return rep.state ?? fallbackState;
}

export const getMyRepsTool: AnyAgentTool = {
  name: "politiclaw_get_my_reps",
  label: "Get my federal representatives",
  description:
    "Resolve federal representatives (US Senate + US House) for the saved address. " +
    "Reads cached reps by default; pass refresh=true to re-fetch. " +
    "Uses the zero-key local shapefile pipeline by default, or Geocodio when configured.",
  parameters: GetMyRepsParams,
  async execute(_toolCallId, rawParams) {
    const params = rawParams as { refresh?: boolean };
    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createRepsResolver({ geocodioApiKey: cfg.apiKeys?.geocodio });

    const result = await identifyMyReps(db, resolver, { refresh: params.refresh });

    if (result.status === "no_preferences") {
      return textResult(`No address on file. ${result.actionable}.`, result);
    }
    if (result.status === "unavailable") {
      const hint = result.actionable ? ` (${result.actionable})` : "";
      return textResult(`Reps unavailable: ${result.reason}.${hint}`, result);
    }

    const lines = result.reps.map((r) => {
      const loc = formatRepLocation(r);
      const party = r.party ? ` (${r.party})` : "";
      return `- ${r.office} ${loc}: ${r.name}${party}`;
    });
    const header = result.fromCache
      ? `Reps (cached from ${result.source.adapterId}, tier ${result.source.tier}):`
      : `Reps (${result.source.adapterId}, tier ${result.source.tier}):`;
    return textResult([header, ...lines].join("\n"), result);
  },
};

export const repsTools: AnyAgentTool[] = [getMyRepsTool];
