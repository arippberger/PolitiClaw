import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import { setupMonitoring, type MonitoringSetupResult } from "../cron/setup.js";
import {
  ACCOUNTABILITY_EXPLAINERS,
  ACCOUNTABILITY_KV_FLAG,
  ACCOUNTABILITY_LABELS,
  ACCOUNTABILITY_VALUES,
  AccountabilityModeSchema,
  IssueStanceSchema,
  MonitoringModeSchema,
  getPreferences,
  listIssueStances,
  setAccountability,
  setMonitoringMode,
  upsertIssueStance,
  upsertPreferences,
  type AccountabilityMode,
  type IssueStanceRow,
  type MonitoringMode,
  type PreferencesRow,
} from "../domain/preferences/index.js";
import {
  buildMonitoringContract,
  renderMonitoringContract,
  type MonitoringContract,
} from "../domain/preferences/contract.js";
import { normalizeFreeformIssue } from "../domain/preferences/normalize.js";
import { identifyMyReps, type IdentifyResult } from "../domain/reps/index.js";
import { createRepsResolver } from "../sources/reps/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { getGatewayCronAdapter } from "../cron/gatewayAdapter.js";
import { parse } from "../validation/typebox.js";
import {
  buildStartOnboardingResult,
  renderChoicePrompt,
  renderStartOnboardingOutput,
  type StartOnboardingResult,
} from "./onboarding.js";
import {
  setApiKeysTool,
  type ApiKeyName,
  type SetApiKeysResult,
} from "./setApiKeys.js";

const MONITORING_KV_FLAG = "onboarding.monitoring_mode_chosen_at";
const API_KEY_NOTICE_KV_FLAG = "onboarding.api_key_notice_shown_at";
const API_DATA_GOV_SIGNUP_URL = "https://api.data.gov/signup/";

const MONITORING_MODE_VALUES = [
  "off",
  "quiet_watch",
  "weekly_digest",
  "action_only",
  "full_copilot",
] as const;

const MODE_LABELS: Record<MonitoringMode, string> = {
  off: "Paused",
  quiet_watch: "Quiet watch",
  weekly_digest: "Weekly digest",
  action_only: "Action only",
  full_copilot: "Full copilot",
};

const MODE_EXPLAINERS: Record<MonitoringMode, string> = {
  off: "PolitiClaw won't run on its own.",
  quiet_watch:
    "Silent background change-detection on tracked bills and hearings. No digests or election alerts.",
  weekly_digest:
    "Sunday digest plus monthly rep report, with background change-detection on tracked items.",
  action_only:
    "Quiet background change-detection plus election-proximity alerts. No weekly digest or monthly rep report.",
  full_copilot:
    "Everything: weekly digest, monthly rep report, election-proximity alerts, 6-hour bill watch, 12-hour committee-hearings sweep.",
};

export type ConfigureStage =
  | "address"
  | "issues"
  | "monitoring"
  | "accountability"
  | "api_key"
  | "api_keys_saved"
  | "complete";

const OPTIONAL_API_KEY_NAMES = [
  "geocodio",
  "openStates",
  "legiscan",
  "openSecrets",
  "followTheMoney",
  "voteSmart",
  "democracyWorks",
  "cicero",
  "ballotReady",
  "googleCivic",
] as const;

type OptionalApiKeyName = (typeof OPTIONAL_API_KEY_NAMES)[number];

const ConfigureParams = Type.Object({
  stage: Type.Optional(
    Type.Union(
      [
        Type.Literal("address"),
        Type.Literal("issues"),
        Type.Literal("monitoring"),
        Type.Literal("accountability"),
        Type.Literal("api_key"),
        Type.Literal("complete"),
      ],
      {
        description:
          "Optional hint for which stage you intend this call to satisfy. The tool re-derives the next stage from DB state regardless, so a wrong hint just no-ops.",
      },
    ),
  ),
  address: Type.Optional(
    Type.String({
      description: "Street address. When provided, saves it and refreshes reps for that address.",
    }),
  ),
  zip: Type.Optional(Type.String()),
  state: Type.Optional(Type.String({ description: "2-letter state code (e.g., CA)." })),
  district: Type.Optional(Type.String({ description: "Congressional district if known." })),
  issueMode: Type.Optional(
    Type.Union([Type.Literal("conversation"), Type.Literal("quiz")], {
      description:
        "Issue-setup style. Use when you want the issues stage to return a quiz or conversational handoff.",
    }),
  ),
  mode: Type.Optional(
    Type.Union([Type.Literal("conversation"), Type.Literal("quiz")], {
      description: "Deprecated alias for issueMode. Prefer issueMode.",
    }),
  ),
  issueStances: Type.Optional(
    Type.Array(
      Type.Object({
        issue: Type.String({
          description:
            "Issue label. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing').",
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
      }),
      { additionalProperties: false },
    ),
  ),
  monitoringMode: Type.Optional(
    Type.Union(
      MONITORING_MODE_VALUES.map((v) => Type.Literal(v)),
      {
        description:
          "How PolitiClaw should watch for you. 'off' pauses everything. 'quiet_watch' is silent unless tracked bills/hearings materially change. 'weekly_digest' adds the Sunday summary and monthly rep report. 'action_only' is quiet except when elections are near or tracked items change. 'full_copilot' enables everything. Defaults to 'action_only' when first configuring unless a mode is already saved.",
      },
    ),
  ),
  accountability: Type.Optional(
    Type.Union(
      ACCOUNTABILITY_VALUES.map((v) => Type.Literal(v)),
      {
        description:
          "How proactive PolitiClaw should be when bills/votes cross your alignment threshold: self_serve (post deltas only), nudge_me (add a 'Your move' section with suggestions), draft_for_me (also draft a letter to your rep proactively).",
      },
    ),
  ),
  refreshReps: Type.Optional(
    Type.Boolean({
      description: "When true, bypass the reps cache and re-resolve representatives.",
    }),
  ),
  apiDataGov: Type.Optional(
    Type.String({
      description:
        "Required api.data.gov key (free, instant signup at https://api.data.gov/signup/). When supplied, the tool persists it via politiclaw_set_api_keys and the gateway restarts to pick it up.",
    }),
  ),
  optionalApiKeys: Type.Optional(
    Type.Object(
      {
        geocodio: Type.Optional(Type.String()),
        openStates: Type.Optional(Type.String()),
        legiscan: Type.Optional(Type.String()),
        openSecrets: Type.Optional(Type.String()),
        followTheMoney: Type.Optional(Type.String()),
        voteSmart: Type.Optional(Type.String()),
        democracyWorks: Type.Optional(Type.String()),
        cicero: Type.Optional(Type.String()),
        ballotReady: Type.Optional(Type.String()),
        googleCivic: Type.Optional(Type.String()),
      },
      {
        additionalProperties: false,
        description:
          "Optional upgrade keys to save in the same call as apiDataGov so the gateway only restarts once. Pass only the keys the user actually has.",
      },
    ),
  ),
});

type ConfigureInput = {
  stage?: ConfigureStage;
  address?: string;
  zip?: string;
  state?: string;
  district?: string;
  issueMode?: "conversation" | "quiz";
  mode?: "conversation" | "quiz";
  issueStances?: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight?: number }>;
  monitoringMode?: MonitoringMode;
  accountability?: AccountabilityMode;
  refreshReps?: boolean;
  apiDataGov?: string;
  optionalApiKeys?: Partial<Record<OptionalApiKeyName, string>>;
};

export type ConfigureResult =
  | {
      stage: "address";
      prompt: string;
      preferences: null;
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "issues";
      prompt: string;
      preferences: PreferencesRow;
      reps: IdentifyResult;
      issueSetup: StartOnboardingResult;
      currentIssueStances: IssueStanceRow[];
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "monitoring";
      prompt: string;
      preferences: PreferencesRow;
      currentIssueStances: IssueStanceRow[];
      currentMonitoringMode: MonitoringMode;
      options: Array<{ label: MonitoringMode; humanLabel: string; explainer: string }>;
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "accountability";
      prompt: string;
      preferences: PreferencesRow;
      currentMonitoringMode: MonitoringMode;
      currentAccountability: AccountabilityMode;
      options: Array<{ label: AccountabilityMode; humanLabel: string; explainer: string }>;
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "api_key";
      prompt: string;
      preferences: PreferencesRow;
      signupUrl: string;
      configPath: string;
      configKey: string;
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "api_keys_saved";
      prompt: string;
      preferences: PreferencesRow | null;
      setResult: SetApiKeysResult;
      savedThisCall: SavedThisCall;
    }
  | {
      stage: "complete";
      prompt: string;
      preferences: PreferencesRow;
      reps: IdentifyResult;
      monitoring: MonitoringSetupResult | null;
      monitoringError: string | null;
      monitoringContract: MonitoringContract;
      savedThisCall: SavedThisCall;
    };

export type SavedThisCall = {
  address: boolean;
  stancesAdded: number;
  monitoringChanged: boolean;
  accountabilityChanged: boolean;
};

export type ConfigureToolDeps = {
  identifyReps?: typeof identifyMyReps;
  createResolver?: typeof createRepsResolver;
  reconcileMonitoring?: typeof setupMonitoring;
  setApiKeys?: (
    keys: Partial<Record<ApiKeyName, string>>,
  ) => Promise<SetApiKeysResult>;
};

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function formatRepLocation(rep: {
  office: string;
  state?: string;
  district?: string;
}): string {
  if (rep.office === "US House") {
    return `${rep.state ?? "Unknown state"}-${rep.district ?? "Unknown district"}`;
  }
  return rep.state ?? "Unknown state";
}

function renderRepsSummary(reps: IdentifyResult): string[] {
  if (reps.status === "ok") {
    return [
      reps.fromCache
        ? `Reps are ready from cache (${reps.source.adapterId}, tier ${reps.source.tier}).`
        : `Reps are ready (${reps.source.adapterId}, tier ${reps.source.tier}).`,
      ...reps.reps.map((rep) => {
        const party = rep.party ? ` (${rep.party})` : "";
        return `- ${rep.office} ${formatRepLocation(rep)}: ${rep.name}${party}`;
      }),
    ];
  }
  if (reps.status === "unavailable") {
    return [
      `Rep lookup is not ready yet: ${reps.reason}.`,
      ...(reps.actionable ? [`Actionable: ${reps.actionable}.`] : []),
    ];
  }
  return [`Rep lookup is waiting on an address: ${reps.actionable}.`];
}

function renderAddressPrompt(): string {
  return [
    "PolitiClaw needs your street address to start.",
    "",
    "Send the address (and zip/state/district if you have them). I'll save it, resolve your federal reps, and walk you through the rest of setup one question at a time.",
  ].join("\n");
}

function renderIssuesPrompt(
  preferences: PreferencesRow,
  reps: IdentifyResult,
  issueSetup: StartOnboardingResult,
  currentStances: readonly IssueStanceRow[],
  saved: SavedThisCall,
): string {
  const lines: string[] = [];
  lines.push(
    saved.address
      ? `Saved your address (${preferences.address}).`
      : `Address on file: ${preferences.address}.`,
  );
  lines.push("");
  lines.push(...renderRepsSummary(reps));
  lines.push("");
  lines.push("Next: tell me which issues matter to you.");
  lines.push("");
  lines.push(
    issueSetup.mode === "choice"
      ? renderChoicePrompt(currentStances)
      : renderStartOnboardingOutput(issueSetup),
  );
  return lines.join("\n");
}

function renderMonitoringPrompt(
  current: MonitoringMode,
  options: Array<{ label: MonitoringMode; humanLabel: string; explainer: string }>,
): string {
  const lines: string[] = [
    "Pick how PolitiClaw should watch for you.",
    "",
    `(Current: ${MODE_LABELS[current]}.)`,
    "",
    "Options:",
  ];
  for (const opt of options) {
    lines.push(`  - **${opt.humanLabel}** — ${opt.explainer}`);
  }
  lines.push("");
  lines.push(
    "Reply with the name of one option (e.g. 'weekly digest').",
  );
  return lines.join("\n");
}

function renderApiKeyPrompt(): string {
  return [
    "Almost done. PolitiClaw needs a free api.data.gov key for federal bills, House roll-call votes, committee schedules, and FEC finance data. Without it, the background jobs we just configured can't actually run. (Senate roll-call votes ingest separately through voteview.com and don't need this key.)",
    "",
    `1. Sign up (free, instant, no credit card): ${API_DATA_GOV_SIGNUP_URL}`,
    "2. Paste the key back into chat — I'll save it for you. You don't need to edit any files yourself.",
    "",
    "If you happen to also have any of these optional upgrade keys, send them in the same message and I'll save everything in one shot (the gateway restarts once per save):",
    "",
    "  - `geocodio` — reps-by-address via API (free tier, alternative to local shapefile path)",
    "  - `openStates` — state bills + votes with member positions",
    "  - `legiscan` — alternative state-bills source (free tier)",
    "  - `openSecrets` — federal campaign-finance derived analytics",
    "  - `followTheMoney` — state-level campaign finance",
    "  - `voteSmart` — structured candidate bios",
    "  - `democracyWorks` — ballot logistics upgrade (partner-gated)",
    "  - `cicero` — local municipal/county/school-board reps (paid)",
    "  - `ballotReady` — fuller down-ballot coverage (commercial)",
    "  - `googleCivic` — required for politiclaw_get_my_ballot",
    "",
    "Or skip for now — setup is saved either way. The monitoring contract will flag the federal jobs as inactive until apiDataGov is in place. Reply with anything to see the final contract.",
  ].join("\n");
}

function renderApiKeysSavedPrompt(setResult: SetApiKeysResult): string {
  if (setResult.status === "error") {
    return [
      "Tried to save your API keys but the gateway rejected the write.",
      `Reason: ${setResult.error}`,
      "",
      "Try again, or paste the key into `~/.openclaw/openclaw.json` under `plugins.politiclaw.apiKeys.apiDataGov` directly and reload the gateway.",
    ].join("\n");
  }
  const lines: string[] = [];
  if (setResult.savedKeys.length === 0) {
    lines.push("No keys were supplied — nothing saved.");
  } else if (setResult.noop) {
    lines.push(
      `${setResult.savedKeys.join(", ")} already match what is configured. No write needed.`,
    );
  } else {
    lines.push(`Saved: ${setResult.savedKeys.join(", ")}.`);
    const seconds =
      typeof setResult.restartDelayMs === "number"
        ? Math.max(1, Math.round(setResult.restartDelayMs / 1000))
        : null;
    lines.push(
      seconds
        ? `The OpenClaw gateway will restart in ~${seconds}s to pick up the new config. Reconnect after the restart and the new keys will be live.`
        : "The OpenClaw gateway will restart shortly to pick up the new config. Reconnect after the restart and the new keys will be live.",
    );
  }
  if (setResult.skippedKeys.length > 0) {
    lines.push(`Skipped (empty values): ${setResult.skippedKeys.join(", ")}.`);
  }
  return lines.join("\n");
}

function renderAccountabilityPrompt(
  current: AccountabilityMode,
  options: Array<{ label: AccountabilityMode; humanLabel: string; explainer: string }>,
): string {
  const lines: string[] = [
    "Last question: how proactive should I be when something material crosses your alignment threshold?",
    "",
    `(Current: '${ACCOUNTABILITY_LABELS[current]}'.)`,
    "",
    "Options:",
  ];
  for (const opt of options) {
    lines.push(`  - **${opt.label}** (${opt.humanLabel}) — ${opt.explainer}`);
  }
  lines.push("");
  lines.push(
    "Reply with one of: " + ACCOUNTABILITY_VALUES.map((v) => `'${v}'`).join(", "),
  );
  return lines.join("\n");
}

function renderCompletePrompt(
  contract: MonitoringContract,
  monitoringError: string | null,
): string {
  const lines: string[] = [renderMonitoringContract(contract)];
  if (monitoringError) {
    lines.push("");
    lines.push(`(Monitoring reconciliation failed: ${monitoringError}. Saved settings remain in place; re-run politiclaw_configure to retry.)`);
  }
  return lines.join("\n");
}

async function defaultSetApiKeys(
  keys: Partial<Record<ApiKeyName, string>>,
): Promise<SetApiKeysResult> {
  const result = await setApiKeysTool.execute!(
    "configure-set-api-keys",
    keys,
    undefined,
    undefined,
  );
  return (result as { details: SetApiKeysResult }).details;
}

function collectSuppliedKeys(
  input: ConfigureInput,
): Partial<Record<ApiKeyName, string>> {
  const out: Partial<Record<ApiKeyName, string>> = {};
  if (typeof input.apiDataGov === "string" && input.apiDataGov.trim().length > 0) {
    out.apiDataGov = input.apiDataGov;
  }
  if (input.optionalApiKeys) {
    for (const name of OPTIONAL_API_KEY_NAMES) {
      const raw = input.optionalApiKeys[name];
      if (typeof raw === "string" && raw.trim().length > 0) {
        out[name] = raw;
      }
    }
  }
  return out;
}

export function createConfigureTool(deps: ConfigureToolDeps = {}): AnyAgentTool {
  const identifyReps = deps.identifyReps ?? identifyMyReps;
  const createResolver = deps.createResolver ?? createRepsResolver;
  const reconcileMonitoring = deps.reconcileMonitoring ?? setupMonitoring;
  const setApiKeys = deps.setApiKeys ?? defaultSetApiKeys;

  return {
    name: "politiclaw_configure",
    label: "Configure PolitiClaw",
    description:
      "One front-door tool that walks the user through PolitiClaw setup end-to-end: " +
      "address → top issues → monitoring mode → accountability preference → " +
      "api.data.gov key (and optional upgrades) → final monitoring contract. " +
      "Call with whatever you have; the tool returns the next question to ask. " +
      "Pass `apiDataGov` (and any `optionalApiKeys` the user has) inline to " +
      "save them via politiclaw_set_api_keys in one shot — the gateway will " +
      "restart once. When everything is collected it reconciles cron jobs once " +
      "and returns stage:'complete' with a monitoringContract summary. Use this " +
      "for first-time setup, reconfiguration, or any 'set up PolitiClaw / " +
      "change my settings' request. Lower-level stance/mode tools still exist " +
      "for one-off edits after setup is complete.",
    parameters: ConfigureParams,
    async execute(_toolCallId, rawParams) {
      const input = (rawParams ?? {}) as ConfigureInput;
      const { db, kv } = getStorage();
      const pluginConfig = getPluginConfig();
      const suppliedKeys = collectSuppliedKeys(input);
      const hasSuppliedKeys = Object.keys(suppliedKeys).length > 0;

      const saved: SavedThisCall = {
        address: false,
        stancesAdded: 0,
        monitoringChanged: false,
        accountabilityChanged: false,
      };

      // 1. Address — save first, since downstream stages assume preferences exist.
      let preferences = getPreferences(db);
      const priorMonitoringMode: MonitoringMode | null =
        preferences?.monitoringMode ?? null;
      const priorAccountability: AccountabilityMode | null =
        preferences?.accountability ?? null;
      if (typeof input.address === "string" && input.address.trim().length > 0) {
        preferences = upsertPreferences(db, {
          address: input.address,
          zip: input.zip,
          state: input.state,
          district: input.district,
          monitoringMode: input.monitoringMode,
          accountability: input.accountability,
        });
        saved.address = true;
      }

      // Stop early to ask for an address only when nothing else needs doing.
      // When the agent is also supplying API keys this call (combined
      // onboarding turn), we still want to persist the keys instead of
      // silently dropping them — fall through and let the api_keys_saved
      // branch below handle the response.
      if (!preferences && !hasSuppliedKeys) {
        const result: ConfigureResult = {
          stage: "address",
          prompt: renderAddressPrompt(),
          preferences: null,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      // 2. Issue stances — save anything passed inline before deciding the cursor.
      //    Free-text issue labels run through normalizeFreeformIssue first so
      //    the canonical-synonym map is the source of truth for slug assignment,
      //    not the agent's inline judgment. We use normalized.slug whether or
      //    not a canonical synonym matched: novel issues still benefit from
      //    toKebabSlug's full punctuation stripping (the schema's transform
      //    only collapses whitespace).
      for (const row of input.issueStances ?? []) {
        const normalized = normalizeFreeformIssue(row.issue);
        const issue = normalized ? normalized.slug : row.issue;
        const validated = parse(IssueStanceSchema, { ...row, issue });
        upsertIssueStance(db, validated);
        saved.stancesAdded += 1;
      }
      const currentIssueStances = listIssueStances(db);

      // 3. Monitoring mode — upsertPreferences already applied it when address
      //    was saved; otherwise persist it separately. Requires a preferences
      //    row, so it's a no-op when the user is only supplying API keys
      //    without an address yet.
      let monitoringSetThisCall = false;
      if (preferences && input.monitoringMode) {
        const parsed = parse(MonitoringModeSchema, input.monitoringMode);
        if (preferences.monitoringMode !== parsed) {
          preferences = setMonitoringMode(db, parsed);
        }
        if (priorMonitoringMode !== parsed) {
          saved.monitoringChanged = true;
        }
        monitoringSetThisCall = true;
        kv.set(MONITORING_KV_FLAG, Date.now());
      }

      // 4. Accountability — same preferences-required guard as monitoring.
      let accountabilitySetThisCall = false;
      if (preferences && input.accountability) {
        const parsed = parse(AccountabilityModeSchema, input.accountability);
        if (preferences.accountability !== parsed) {
          preferences = setAccountability(db, parsed);
        }
        if (priorAccountability !== parsed) {
          saved.accountabilityChanged = true;
        }
        accountabilitySetThisCall = true;
        kv.set(ACCOUNTABILITY_KV_FLAG, Date.now());
      }

      // 4b. API keys: persist them only after the rest of this call's
      //     onboarding fields have been written. The gateway will restart
      //     to pick up the new config and the current session ends — any
      //     state we have not already saved to the plugin DB before this
      //     point would be lost. savedThisCall now reflects the actual
      //     non-key work that happened this call rather than reporting all
      //     fields as unsaved.
      if (hasSuppliedKeys) {
        const setResult = await setApiKeys(suppliedKeys);
        const result: ConfigureResult = {
          stage: "api_keys_saved",
          prompt: renderApiKeysSavedPrompt(setResult),
          preferences: preferences ?? null,
          setResult,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      // Invariant: from here on, preferences is always set. The two ways
      // it could be null — no prior row and no address supplied this call —
      // both already returned: the no-keys case took the "address" stage at
      // step 1.5, and the keys-supplied case took "api_keys_saved" at 4b.
      if (!preferences) {
        throw new Error(
          "politiclaw_configure: unreachable — preferences should be set before stage decisions",
        );
      }

      // 5. Decide the next stage.
      const monitoringCaptured =
        monitoringSetThisCall || kv.get<number>(MONITORING_KV_FLAG) !== undefined;
      const accountabilityCaptured =
        accountabilitySetThisCall || kv.get<number>(ACCOUNTABILITY_KV_FLAG) !== undefined;

      // Lazy reps resolution — only when needed (issues / complete stages).
      let reps: IdentifyResult | null = null;
      const ensureReps = async (): Promise<IdentifyResult> => {
        if (reps) return reps;
        const resolver = createResolver({ geocodioApiKey: pluginConfig.apiKeys?.geocodio });
        reps = await identifyReps(db, resolver, {
          refresh: Boolean(input.refreshReps) || saved.address,
        });
        return reps;
      };

      if (currentIssueStances.length === 0) {
        const issueSetup = buildStartOnboardingResult(
          input.issueMode || input.mode ? { mode: input.issueMode ?? input.mode } : {},
          currentIssueStances,
        );
        const repsResult = await ensureReps();
        const result: ConfigureResult = {
          stage: "issues",
          prompt: renderIssuesPrompt(
            preferences,
            repsResult,
            issueSetup,
            currentIssueStances,
            saved,
          ),
          preferences,
          reps: repsResult,
          issueSetup,
          currentIssueStances,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      if (!monitoringCaptured) {
        const options = MONITORING_MODE_VALUES.map((label) => ({
          label,
          humanLabel: MODE_LABELS[label],
          explainer: MODE_EXPLAINERS[label],
        }));
        const result: ConfigureResult = {
          stage: "monitoring",
          prompt: renderMonitoringPrompt(preferences.monitoringMode, options),
          preferences,
          currentIssueStances,
          currentMonitoringMode: preferences.monitoringMode,
          options,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      if (!accountabilityCaptured) {
        const options = ACCOUNTABILITY_VALUES.map((label) => ({
          label,
          humanLabel: ACCOUNTABILITY_LABELS[label],
          explainer: ACCOUNTABILITY_EXPLAINERS[label],
        }));
        const result: ConfigureResult = {
          stage: "accountability",
          prompt: renderAccountabilityPrompt(preferences.accountability, options),
          preferences,
          currentMonitoringMode: preferences.monitoringMode,
          currentAccountability: preferences.accountability,
          options,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      // 5b. api.data.gov key — show once, don't loop. Plugin config is host-
      //     managed, so we can only surface instructions; we can't persist the
      //     key from here.
      const apiKeyNoticeShown =
        kv.get<number>(API_KEY_NOTICE_KV_FLAG) !== undefined;
      const apiDataGovMissing = !pluginConfig.apiKeys?.apiDataGov;
      if (apiDataGovMissing && !apiKeyNoticeShown) {
        kv.set(API_KEY_NOTICE_KV_FLAG, Date.now());
        const result: ConfigureResult = {
          stage: "api_key",
          prompt: renderApiKeyPrompt(),
          preferences,
          signupUrl: API_DATA_GOV_SIGNUP_URL,
          configPath: "plugins.politiclaw.apiKeys.apiDataGov",
          configKey: "apiDataGov",
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      // 6. Complete — reconcile cron only if something cron-affecting changed
      //    this call (or first-time complete).
      const cronAffectingChange =
        saved.address || saved.monitoringChanged;
      let monitoring: MonitoringSetupResult | null = null;
      let monitoringError: string | null = null;
      if (cronAffectingChange) {
        try {
          monitoring = await reconcileMonitoring({ mode: preferences.monitoringMode });
        } catch (error) {
          monitoringError = error instanceof Error ? error.message : String(error);
        }
      }

      const repsResult = await ensureReps();
      const contract = await buildMonitoringContract({
        db,
        config: pluginConfig,
        cronAdapter: getGatewayCronAdapter(),
      });

      const result: ConfigureResult = {
        stage: "complete",
        prompt: renderCompletePrompt(contract, monitoringError),
        preferences,
        reps: repsResult,
        monitoring,
        monitoringError,
        monitoringContract: contract,
        savedThisCall: saved,
      };
      return textResult(result.prompt, result);
    },
  };
}

export const configureTool = createConfigureTool();
export const configureTools: AnyAgentTool[] = [configureTool];
