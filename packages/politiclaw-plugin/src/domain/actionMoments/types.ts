/**
 * Trigger classes describe *why* the classifier decided a change is a
 * decision point. Each maps to one or more package kinds via propose.ts.
 */
export const TRIGGER_CLASSES = [
  "bill_nearing_vote",
  "tracked_event_scheduled",
  "repeated_misalignment",
  "election_proximity",
  "new_bill_high_relevance",
] as const;
export type TriggerClass = (typeof TRIGGER_CLASSES)[number];

export const ACTION_PACKAGE_KINDS = [
  "outreach",
  "reminder",
  "election_prep_prompt",
] as const;
export type ActionPackageKind = (typeof ACTION_PACKAGE_KINDS)[number];

export const OUTREACH_MODES = ["letter", "call"] as const;
export type OutreachMode = (typeof OUTREACH_MODES)[number];

export const PACKAGE_STATUSES = [
  "open",
  "used",
  "dismissed",
  "stopped",
  "expired",
] as const;
export type PackageStatus = (typeof PACKAGE_STATUSES)[number];

export const FEEDBACK_VERDICTS = ["useful", "not_now", "stop"] as const;
export type PackageFeedbackVerdict = (typeof FEEDBACK_VERDICTS)[number];

/** Target tuple that identifies what a package is *about*, for dedup + cooldown. */
export type ActionPackageTarget = {
  billId: string | null;
  repId: string | null;
  issue: string | null;
  electionDate: string | null;
};

export type ActionPackageRow = {
  id: number;
  createdAt: number;
  triggerClass: TriggerClass;
  packageKind: ActionPackageKind;
  outreachMode: OutreachMode | null;
  billId: string | null;
  repId: string | null;
  issue: string | null;
  electionDate: string | null;
  decisionHash: string;
  summary: string;
  status: PackageStatus;
  statusAt: number;
  generatedLetterId: number | null;
  generatedCallScriptId: number | null;
  generatedReminderId: number | null;
  sourceAdapterId: string;
  sourceTier: number;
};

export type ActionPackageFeedbackRow = {
  id: number;
  packageId: number;
  createdAt: number;
  verdict: PackageFeedbackVerdict;
  note: string | null;
};
