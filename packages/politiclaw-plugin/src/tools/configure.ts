import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";

import { setupMonitoring, type MonitoringSetupResult } from "../cron/setup.js";
import {
  IssueStanceSchema,
  MonitoringCadenceSchema,
  getPreferences,
  listIssueStances,
  setMonitoringCadence,
  upsertIssueStance,
  upsertPreferences,
  type IssueStanceRow,
  type MonitoringCadence,
  type PreferencesRow,
} from "../domain/preferences/index.js";
import { identifyMyReps, type IdentifyResult } from "../domain/reps/index.js";
import { createRepsResolver } from "../sources/reps/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import {
  buildStartOnboardingResult,
  renderChoicePrompt,
  renderStartOnboardingOutput,
  type StartOnboardingResult,
} from "./onboarding.js";

const ConfigureParams = Type.Object({
  address: Type.Optional(
    Type.String({
      description: "Street address. When provided, saves it and refreshes reps for that address.",
    }),
  ),
  zip: Type.Optional(Type.String()),
  state: Type.Optional(Type.String({ description: "2-letter state code (e.g., CA)." })),
  district: Type.Optional(Type.String({ description: "Congressional district if known." })),
  mode: Type.Optional(
    Type.Union([Type.Literal("conversation"), Type.Literal("quiz")], {
      description:
        "Optional issue-setup style. Use when the user is ready to walk through stance setup.",
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
      {
        additionalProperties: false,
      },
    ),
  ),
  monitoringCadence: Type.Optional(
    Type.Union(
      [
        Type.Literal("off"),
        Type.Literal("election_proximity"),
        Type.Literal("weekly"),
        Type.Literal("both"),
      ],
      {
        description:
          "How loud PolitiClaw monitoring should be. Defaults to election_proximity when first configuring unless a cadence is already saved.",
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
  address?: string;
  zip?: string;
  state?: string;
  district?: string;
  mode?: "conversation" | "quiz";
  issueStances?: Array<{ issue: string; stance: "support" | "oppose" | "neutral"; weight?: number }>;
  monitoringCadence?: MonitoringCadence;
  refreshReps?: boolean;
};

type ConfigureNeedsAddressResult = {
  status: "needs_address";
  preferences: null;
};

type ConfigureNeedsIssueSetupResult = {
  status: "needs_issue_setup";
  preferences: PreferencesRow;
  reps: IdentifyResult;
  issueSetup: StartOnboardingResult;
  cadence: MonitoringCadence;
  addressUpdated: boolean;
  savedIssueStances: IssueStanceRow[];
  currentIssueStances: IssueStanceRow[];
};

type ConfigureConfiguredResult = {
  status: "configured";
  preferences: PreferencesRow;
  reps: IdentifyResult;
  cadence: MonitoringCadence;
  monitoring: MonitoringSetupResult;
  addressUpdated: boolean;
  savedIssueStances: IssueStanceRow[];
  currentIssueStances: IssueStanceRow[];
};

type ConfigurePartialResult = {
  status: "partial";
  preferences: PreferencesRow;
  reps: IdentifyResult;
  cadence: MonitoringCadence;
  monitoringError: string;
  addressUpdated: boolean;
  savedIssueStances: IssueStanceRow[];
  currentIssueStances: IssueStanceRow[];
};

export type ConfigureResult =
  | ConfigureNeedsAddressResult
  | ConfigureNeedsIssueSetupResult
  | ConfigureConfiguredResult
  | ConfigurePartialResult;

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

function renderNeedsAddress(): string {
  return [
    "PolitiClaw needs your street address before it can finish configuration.",
    "",
    "Send the address, and I can save it, resolve your reps, and continue the rest of setup.",
  ].join("\n");
}

function renderNeedsIssueSetup(result: ConfigureNeedsIssueSetupResult): string {
  const lines: string[] = [];
  lines.push(
    result.addressUpdated
      ? `Saved your address for ${result.preferences.address}.`
      : `Using your saved address for ${result.preferences.address}.`,
  );
  lines.push("");
  lines.push(...renderRepsSummary(result.reps));
  lines.push("");
  lines.push("Next step: tell me what issues matter to you.");
  lines.push("");
  if (result.savedIssueStances.length > 0) {
    lines.push(
      `Saved ${result.savedIssueStances.length} issue stance${result.savedIssueStances.length === 1 ? "" : "s"} from this call, but I still need at least one more or a confirmation flow before I finish configuration.`,
    );
    lines.push("");
  }
  lines.push(
    result.issueSetup.mode === "choice"
      ? renderChoicePrompt(result.currentIssueStances)
      : renderStartOnboardingOutput(result.issueSetup),
  );
  lines.push("");
  lines.push(
    `Monitoring will default to '${result.cadence}' once issue setup is complete unless you tell me to use a different cadence.`,
  );
  return lines.join("\n");
}

function renderConfigured(result: ConfigureConfiguredResult): string {
  const lines: string[] = ["PolitiClaw is configured.", ""];
  lines.push(`- Address: ${result.preferences.address}`);
  lines.push(`- Monitoring cadence: ${result.cadence}`);
  lines.push(
    `- Issue stances: ${result.currentIssueStances.length} total${
      result.savedIssueStances.length > 0 ? ` (${result.savedIssueStances.length} saved this call)` : ""
    }`,
  );
  if (result.reps.status === "ok") {
    lines.push(`- Reps: ${result.reps.reps.length} loaded`);
  } else {
    lines.push(`- Reps: not ready (${result.reps.reason})`);
  }
  const changedJobs = result.monitoring.outcomes.filter(
    (outcome) => outcome.action !== "unchanged" && outcome.action !== "missing",
  ).length;
  lines.push(`- Monitoring jobs reconciled: ${result.monitoring.outcomes.length} checked, ${changedJobs} changed`);
  if (result.reps.status !== "ok") {
    lines.push("");
    lines.push(...renderRepsSummary(result.reps));
  }
  return lines.join("\n");
}

function renderPartial(result: ConfigurePartialResult): string {
  const lines = [renderConfigured({ ...result, status: "configured", monitoring: { outcomes: [] } }), ""];
  lines.push(`Monitoring reconciliation failed: ${result.monitoringError}`);
  lines.push("Your saved preferences and issue stances are still in place.");
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
      "Single front door for PolitiClaw setup and reconfiguration. Saves or updates the user's address, resolves reps, runs issue-stance setup, and applies monitoring cadence in one flow. When information is missing, returns the next setup step instead of requiring separate setup tools.",
    parameters: ConfigureParams,
    async execute(_toolCallId, rawParams) {
      const input = (rawParams ?? {}) as ConfigureInput;
      const { db } = getStorage();
      const pluginConfig = getPluginConfig();

      let preferences = getPreferences(db);
      let addressUpdated = false;

      if (typeof input.address === "string" && input.address.trim().length > 0) {
        preferences = upsertPreferences(db, {
          address: input.address,
          zip: input.zip,
          state: input.state,
          district: input.district,
          monitoringCadence: input.monitoringCadence,
        });
        addressUpdated = true;
      } else if (input.monitoringCadence) {
        const parsedCadence = MonitoringCadenceSchema.parse(input.monitoringCadence);
        try {
          preferences = setMonitoringCadence(db, parsedCadence);
        } catch {
          // We surface the missing-address case below through the normal gate.
        }
      }

      if (!preferences) {
        return textResult(renderNeedsAddress(), {
          status: "needs_address",
          preferences: null,
        } satisfies ConfigureNeedsAddressResult);
      }

      const cadence = preferences.monitoringCadence ?? "election_proximity";
      const resolver = createResolver({ geocodioApiKey: pluginConfig.apiKeys?.geocodio });
      const reps = await identifyReps(db, resolver, {
        refresh: Boolean(input.refreshReps) || addressUpdated,
      });

      const savedIssueStances: IssueStanceRow[] = [];
      for (const row of input.issueStances ?? []) {
        const validated = IssueStanceSchema.parse(row);
        savedIssueStances.push(upsertIssueStance(db, validated));
      }

      const currentIssueStances = listIssueStances(db);
      if (currentIssueStances.length === 0) {
        const issueSetup = buildStartOnboardingResult(
          input.mode ? { mode: input.mode } : {},
          currentIssueStances,
        );
        const result: ConfigureNeedsIssueSetupResult = {
          status: "needs_issue_setup",
          preferences,
          reps,
          issueSetup,
          cadence,
          addressUpdated,
          savedIssueStances,
          currentIssueStances,
        };
        return textResult(renderNeedsIssueSetup(result), result);
      }

      try {
        const monitoring = await reconcileMonitoring({ cadence });
        const result: ConfigureConfiguredResult = {
          status: "configured",
          preferences,
          reps,
          cadence,
          monitoring,
          addressUpdated,
          savedIssueStances,
          currentIssueStances,
        };
        return textResult(renderConfigured(result), result);
      } catch (error) {
        const monitoringError = error instanceof Error ? error.message : String(error);
        const result: ConfigurePartialResult = {
          status: "partial",
          preferences,
          reps,
          cadence,
          monitoringError,
          addressUpdated,
          savedIssueStances,
          currentIssueStances,
        };
        return textResult(renderPartial(result), result);
      }
    },
  };
}

export const configureTool = createConfigureTool();
export const configureTools: AnyAgentTool[] = [configureTool];
