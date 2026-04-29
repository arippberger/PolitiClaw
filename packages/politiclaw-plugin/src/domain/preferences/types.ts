import { type Static, Type } from "@sinclair/typebox";

import { AccountabilityModeSchema, type AccountabilityMode } from "./accountability.js";

export { AccountabilityModeSchema };
export type { AccountabilityMode };

export const MONITORING_MODE_VALUES = [
  "off",
  "quiet_watch",
  "weekly_digest",
  "action_only",
  "full_copilot",
] as const;

export const MonitoringModeSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("quiet_watch"),
  Type.Literal("weekly_digest"),
  Type.Literal("action_only"),
  Type.Literal("full_copilot"),
]);

export type MonitoringMode = Static<typeof MonitoringModeSchema>;

export const ACTION_PROMPTING_VALUES = ["off", "on"] as const;

export const ActionPromptingSchema = Type.Union([
  Type.Literal("off"),
  Type.Literal("on"),
]);

export type ActionPrompting = Static<typeof ActionPromptingSchema>;

/**
 * Schema for user preferences. Validates the *normalized* shape:
 * `zip`, `state`, and `district` are expected pre-trimmed, and `state`
 * is expected pre-uppercased. The normalization step lives in
 * `upsertPreferences` (see ./index.ts) so the schema can be a plain
 * value-validator without TypeBox transform plumbing.
 *
 * `state` accepts either a 2-letter uppercase code or the empty string
 * (the empty string is what a "user typed only spaces" path normalizes to).
 */
export const PreferencesSchema = Type.Object({
  address: Type.String({ minLength: 1 }),
  zip: Type.Optional(Type.String()),
  state: Type.Optional(
    Type.Union([Type.String({ pattern: "^[A-Z]{2}$" }), Type.Literal("")]),
  ),
  district: Type.Optional(Type.String()),
  monitoringMode: Type.Optional(MonitoringModeSchema),
  accountability: Type.Optional(AccountabilityModeSchema),
  actionPrompting: Type.Optional(ActionPromptingSchema),
});

export type Preferences = Static<typeof PreferencesSchema>;

export type PreferencesRow = Preferences & {
  monitoringMode: MonitoringMode;
  accountability: AccountabilityMode;
  actionPrompting: ActionPrompting;
  updatedAt: number;
};

const StanceDirectionSchema = Type.Union([
  Type.Literal("agree"),
  Type.Literal("disagree"),
  Type.Literal("skip"),
]);

const StanceSourceSchema = Type.Union([
  Type.Literal("onboarding"),
  Type.Literal("monitoring"),
  Type.Literal("dashboard"),
]);

/**
 * Schema for stance-signal input *after* the caller has trimmed `issue`
 * and `billId`. The cross-field rule "one of issue or billId required"
 * is enforced in `recordStanceSignal` since TypeBox doesn't express
 * cross-field invariants in the schema. `weight` defaults to 1.0 in the
 * caller when undefined.
 */
export const StanceSignalSchema = Type.Object({
  issue: Type.Optional(Type.String({ minLength: 1 })),
  billId: Type.Optional(Type.String({ minLength: 1 })),
  direction: StanceDirectionSchema,
  weight: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
  source: StanceSourceSchema,
});

export type StanceSignal = Static<typeof StanceSignalSchema>;

const IssueStanceStanceSchema = Type.Union([
  Type.Literal("support"),
  Type.Literal("oppose"),
  Type.Literal("neutral"),
]);

/**
 * User-declared position on a policy issue. Drives bill alignment scoring
 * and representative scoring. Distinct from {@link StanceSignal}, which is a
 * single interaction event.
 *
 * Schema validates the *normalized* shape: callers MUST trim and dashify
 * `issue` (lowercase, whitespace -> '-') before parsing. `weight` defaults
 * to 3 in the caller when undefined.
 *
 * `note` carries a short paraphrase of the user's specific concern within
 * this issue bucket (e.g., "BWCA wilderness federal protections" under the
 * `public-lands-and-natural-resources` slug). `sourceText` preserves the
 * verbatim user phrasing for letter drafting and call scripts. Neither
 * field affects bill matching — keyword expansion runs on the slug alone.
 */
export const IssueStanceSchema = Type.Object({
  issue: Type.String({ minLength: 1 }),
  stance: IssueStanceStanceSchema,
  weight: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
  note: Type.Optional(Type.String()),
  sourceText: Type.Optional(Type.String()),
});

/** Caller-provided shape: `weight` is optional and defaults to 3 in
 *  `upsertIssueStance` when undefined. */
export type IssueStanceInput = Static<typeof IssueStanceSchema>;

/** Post-default form, which is what scoring code and storage rows read.
 *  `weight` is always defined here. */
export type IssueStance = Omit<IssueStanceInput, "weight"> & { weight: number };

export type IssueStanceRow = IssueStance & { updatedAt: number };
