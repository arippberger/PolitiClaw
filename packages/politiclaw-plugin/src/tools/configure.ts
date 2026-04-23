import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

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
import { identifyMyReps, type IdentifyResult } from "../domain/reps/index.js";
import { createRepsResolver } from "../sources/reps/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { getGatewayCronAdapter } from "../cron/gatewayAdapter.js";
import {
  buildStartOnboardingResult,
  renderChoicePrompt,
  renderStartOnboardingOutput,
  type StartOnboardingResult,
} from "./onboarding.js";

const MONITORING_KV_FLAG = "onboarding.monitoring_mode_chosen_at";

const MONITORING_MODE_VALUES = [
  "off",
  "quiet_watch",
  "weekly_digest",
  "action_only",
  "full_copilot",
] as const;

const MODE_EXPLAINERS: Record<MonitoringMode, string> = {
  off: "Paused — PolitiClaw won't run on its own.",
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
  | "complete";

const ConfigureParams = Type.Object({
  stage: Type.Optional(
    Type.Union(
      [
        Type.Literal("address"),
        Type.Literal("issues"),
        Type.Literal("monitoring"),
        Type.Literal("accountability"),
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
      options: Array<{ label: MonitoringMode; explainer: string }>;
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
  options: Array<{ label: MonitoringMode; explainer: string }>,
): string {
  const lines: string[] = [
    "Pick how PolitiClaw should watch for you.",
    "",
    `(Current: '${current}'.)`,
    "",
    "Options:",
  ];
  for (const opt of options) {
    lines.push(`  - **${opt.label}** — ${opt.explainer}`);
  }
  lines.push("");
  lines.push(
    "Reply with one of: " + MONITORING_MODE_VALUES.map((v) => `'${v}'`).join(", "),
  );
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

export function createConfigureTool(deps: ConfigureToolDeps = {}): AnyAgentTool {
  const identifyReps = deps.identifyReps ?? identifyMyReps;
  const createResolver = deps.createResolver ?? createRepsResolver;
  const reconcileMonitoring = deps.reconcileMonitoring ?? setupMonitoring;

  return {
    name: "politiclaw_configure",
    label: "Configure PolitiClaw",
    description:
      "One front-door tool that walks the user through PolitiClaw setup end-to-end: " +
      "address → top issues → monitoring mode → accountability preference → final " +
      "monitoring contract. Call with whatever you have; the tool returns the next " +
      "question to ask. When everything is collected it reconciles cron jobs once and " +
      "returns stage:'complete' with a monitoringContract summary. Use this for " +
      "first-time setup, reconfiguration, or any 'set up PolitiClaw / change my " +
      "settings' request. Lower-level stance/mode tools still exist for one-off " +
      "edits after setup is complete.",
    parameters: ConfigureParams,
    async execute(_toolCallId, rawParams) {
      const input = (rawParams ?? {}) as ConfigureInput;
      const { db, kv } = getStorage();
      const pluginConfig = getPluginConfig();

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

      if (!preferences) {
        const result: ConfigureResult = {
          stage: "address",
          prompt: renderAddressPrompt(),
          preferences: null,
          savedThisCall: saved,
        };
        return textResult(result.prompt, result);
      }

      // 2. Issue stances — save anything passed inline before deciding the cursor.
      for (const row of input.issueStances ?? []) {
        const validated = IssueStanceSchema.parse(row);
        upsertIssueStance(db, validated);
        saved.stancesAdded += 1;
      }
      const currentIssueStances = listIssueStances(db);

      // 3. Monitoring mode — upsertPreferences already applied it when address
      //    was saved; otherwise persist it separately.
      let monitoringSetThisCall = false;
      if (input.monitoringMode) {
        const parsed = MonitoringModeSchema.parse(input.monitoringMode);
        if (preferences.monitoringMode !== parsed) {
          preferences = setMonitoringMode(db, parsed);
        }
        if (priorMonitoringMode !== parsed) {
          saved.monitoringChanged = true;
        }
        monitoringSetThisCall = true;
        kv.set(MONITORING_KV_FLAG, Date.now());
      }

      // 4. Accountability.
      let accountabilitySetThisCall = false;
      if (input.accountability) {
        const parsed = AccountabilityModeSchema.parse(input.accountability);
        if (preferences.accountability !== parsed) {
          preferences = setAccountability(db, parsed);
        }
        if (priorAccountability !== parsed) {
          saved.accountabilityChanged = true;
        }
        accountabilitySetThisCall = true;
        kv.set(ACCOUNTABILITY_KV_FLAG, Date.now());
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
