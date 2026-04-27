import { type Static, Type } from "@sinclair/typebox";

/**
 * Accountability mode controls how proactive PolitiClaw is when a tracked
 * bill or rep vote crosses the user's alignment threshold. The labels are
 * product-shaped (what the user sees) — downstream skill behavior is wired
 * to these values directly, so adding modes is additive at the schema level.
 */
export const ACCOUNTABILITY_VALUES = ["self_serve", "nudge_me", "draft_for_me"] as const;

export const AccountabilityModeSchema = Type.Union([
  Type.Literal("self_serve"),
  Type.Literal("nudge_me"),
  Type.Literal("draft_for_me"),
]);

export type AccountabilityMode = Static<typeof AccountabilityModeSchema>;

export const ACCOUNTABILITY_EXPLAINERS: Record<AccountabilityMode, string> = {
  self_serve:
    "I post deltas only — you decide whether to act. No suggested follow-ups.",
  nudge_me:
    "I append a 'Your move' section with one to three suggested actions when something material crosses your alignment threshold.",
  draft_for_me:
    "Same as 'nudge me', plus when a tracked bill or vote crosses your alignment threshold I draft a letter to your rep proactively for you to review.",
};

export const ACCOUNTABILITY_LABELS: Record<AccountabilityMode, string> = {
  self_serve: "Self-serve",
  nudge_me: "Nudge me",
  draft_for_me: "Draft for me",
};

/** KV flag set the first time the accountability stage is shown to a user. */
export const ACCOUNTABILITY_KV_FLAG = "onboarding.accountability_explained_at";

export const DEFAULT_ACCOUNTABILITY: AccountabilityMode = "self_serve";
