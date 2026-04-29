import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { API_KEY_NAMES, type ApiKeyName } from "../config/apiKeys.js";
import {
  getGatewayConfigAdapter,
  type ConfigPatchResult,
  type GatewayConfigAdapter,
} from "../config/gatewayConfigAdapter.js";

export type { ApiKeyName };

const ApiKeyField = (description: string) =>
  Type.Optional(Type.String({ description }));

const SetApiKeysParams = Type.Object({
  apiDataGov: ApiKeyField(
    "REQUIRED in practice. Free api.data.gov key — covers api.congress.gov (federal bills, House roll-call votes, committee schedules) and FEC OpenFEC. Sign up at https://api.data.gov/signup/.",
  ),
  geocodio: ApiKeyField(
    "OPTIONAL. Geocodio key — reps-by-address via API. Free tier 2,500 lookups/day.",
  ),
  openStates: ApiKeyField(
    "OPTIONAL. Open States key — state bills and votes with member positions.",
  ),
  legiscan: ApiKeyField(
    "OPTIONAL. LegiScan key — alternative state-bills source. Free tier 30k queries/month.",
  ),
  openSecrets: ApiKeyField(
    "OPTIONAL. OpenSecrets key — federal campaign-finance derived analytics. Non-commercial use only.",
  ),
  followTheMoney: ApiKeyField(
    "OPTIONAL. FollowTheMoney key — state-level campaign finance.",
  ),
  voteSmart: ApiKeyField("OPTIONAL. Vote Smart key — structured candidate bios."),
  democracyWorks: ApiKeyField(
    "OPTIONAL. Democracy Works key — ballot logistics upgrade. Partner-gated.",
  ),
  cicero: ApiKeyField(
    "OPTIONAL (paid). Cicero key — local municipal/county/school-board representatives.",
  ),
  ballotReady: ApiKeyField(
    "OPTIONAL (commercial). BallotReady key — fuller down-ballot coverage.",
  ),
  googleCivic: ApiKeyField(
    "OPTIONAL. Google Civic key — required for politiclaw_get_my_ballot. Create in Google Cloud console with the Civic Information API enabled.",
  ),
});

type SetApiKeysInput = Partial<Record<ApiKeyName, string>>;

export type SetApiKeysSavedResult = {
  status: "ok";
  savedKeys: ApiKeyName[];
  skippedKeys: ApiKeyName[];
  noop: boolean;
  restartScheduled: boolean;
  restartDelayMs?: number;
  configPath?: string;
};

export type SetApiKeysNoopResult = {
  status: "ok";
  savedKeys: [];
  skippedKeys: ApiKeyName[];
  noop: true;
  restartScheduled: false;
  restartDelayMs?: undefined;
  configPath?: undefined;
};

export type SetApiKeysErrorResult = {
  status: "error";
  error: string;
  savedKeys: [];
  skippedKeys: ApiKeyName[];
  noop: false;
  restartScheduled: false;
};

export type SetApiKeysResult =
  | SetApiKeysSavedResult
  | SetApiKeysNoopResult
  | SetApiKeysErrorResult;

export type SetApiKeysToolDeps = {
  configAdapter?: GatewayConfigAdapter;
};

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

/**
 * Pulls the recognized keys out of arbitrary input, trims whitespace, and
 * splits them into "ready to write" vs "skipped because empty/whitespace."
 * Unknown field names are dropped silently by the allowlist iteration.
 */
function partitionInput(input: SetApiKeysInput): {
  toSave: Partial<Record<ApiKeyName, string>>;
  skipped: ApiKeyName[];
} {
  const toSave: Partial<Record<ApiKeyName, string>> = {};
  const skipped: ApiKeyName[] = [];
  for (const name of API_KEY_NAMES) {
    const raw = input[name];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      skipped.push(name);
      continue;
    }
    toSave[name] = trimmed;
  }
  return { toSave, skipped };
}

function renderNoopPrompt(skipped: ApiKeyName[]): string {
  if (skipped.length === 0) {
    return "No keys supplied. Pass any of: " + API_KEY_NAMES.join(", ") + ".";
  }
  return [
    "Nothing to save — every key you sent was empty or whitespace.",
    `Skipped (empty): ${skipped.join(", ")}.`,
  ].join("\n");
}

function renderSavedPrompt(args: {
  saved: ApiKeyName[];
  skipped: ApiKeyName[];
  noop: boolean;
  restartDelayMs?: number;
  configPath?: string;
}): string {
  const lines: string[] = [];
  if (args.noop) {
    lines.push(
      `No change — the supplied value(s) for ${args.saved.join(", ")} match what is already configured.`,
    );
  } else {
    lines.push(`Saved: ${args.saved.join(", ")}.`);
    if (args.configPath) {
      lines.push(`Written to ${args.configPath}.`);
    }
    const seconds =
      typeof args.restartDelayMs === "number"
        ? Math.max(1, Math.round(args.restartDelayMs / 1000))
        : null;
    lines.push(
      seconds
        ? `The OpenClaw gateway will restart in ~${seconds}s to pick up the new config. Reconnect after the restart and the new keys will be live.`
        : "The OpenClaw gateway will restart shortly to pick up the new config. Reconnect after the restart and the new keys will be live.",
    );
  }
  if (args.skipped.length > 0) {
    lines.push(`Skipped (empty): ${args.skipped.join(", ")}.`);
  }
  return lines.join("\n");
}

function renderErrorPrompt(error: string): string {
  return [
    "Could not save the API keys.",
    `Reason: ${error}`,
    "",
    "If the gateway reports a baseHash mismatch, the config file changed mid-write — re-run the tool and it will read a fresh snapshot.",
  ].join("\n");
}

export function createSetApiKeysTool(
  deps: SetApiKeysToolDeps = {},
): AnyAgentTool {
  return {
    name: "politiclaw_set_api_keys",
    label: "Save PolitiClaw API keys",
    description:
      "Persist one or more PolitiClaw API keys into the user's OpenClaw " +
      "config (`plugins.entries.politiclaw.config.apiKeys.*`). Pass only the keys the user " +
      "actually has — unsupplied fields are left untouched. Writes go through " +
      "the gateway's `config.patch` method (validated, audited, optimistic " +
      "concurrency); the gateway schedules its own restart so the new values " +
      "become live. The required key is `apiDataGov` (one free key from " +
      "api.data.gov covers federal bills, House roll-call votes, committee " +
      "schedules, and FEC finance). All other keys are optional upgrades. " +
      "Prefer one call with every key the user has, since each call triggers " +
      "exactly one gateway restart.",
    parameters: SetApiKeysParams,
    async execute(_toolCallId, rawParams) {
      const input = (rawParams ?? {}) as SetApiKeysInput;
      const { toSave, skipped } = partitionInput(input);
      const savedKeys = Object.keys(toSave) as ApiKeyName[];

      if (savedKeys.length === 0) {
        const result: SetApiKeysNoopResult = {
          status: "ok",
          savedKeys: [],
          skippedKeys: skipped,
          noop: true,
          restartScheduled: false,
        };
        return textResult(renderNoopPrompt(skipped), result);
      }

      const adapter = deps.configAdapter ?? getGatewayConfigAdapter();
      let snapshotHash: string;
      try {
        const snapshot = await adapter.getSnapshot();
        snapshotHash = snapshot.hash;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: SetApiKeysErrorResult = {
          status: "error",
          error: message,
          savedKeys: [],
          skippedKeys: skipped,
          noop: false,
          restartScheduled: false,
        };
        return textResult(renderErrorPrompt(message), result);
      }

      let patchResult: ConfigPatchResult;
      try {
        patchResult = await adapter.patch({
          patch: {
            plugins: {
              entries: {
                politiclaw: {
                  config: {
                    apiKeys: toSave,
                  },
                },
              },
            },
          },
          baseHash: snapshotHash,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const result: SetApiKeysErrorResult = {
          status: "error",
          error: message,
          savedKeys: [],
          skippedKeys: skipped,
          noop: false,
          restartScheduled: false,
        };
        return textResult(renderErrorPrompt(message), result);
      }

      const result: SetApiKeysSavedResult = {
        status: "ok",
        savedKeys,
        skippedKeys: skipped,
        noop: patchResult.noop,
        restartScheduled: Boolean(patchResult.restart) && !patchResult.noop,
        restartDelayMs: patchResult.restart?.delayMs,
        configPath: patchResult.path,
      };
      return textResult(
        renderSavedPrompt({
          saved: savedKeys,
          skipped,
          noop: patchResult.noop,
          restartDelayMs: patchResult.restart?.delayMs,
          configPath: patchResult.path,
        }),
        result,
      );
    },
  };
}

export const setApiKeysTool = createSetApiKeysTool();
