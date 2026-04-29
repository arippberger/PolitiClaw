import type { ApiKeyName } from "../../config/apiKeys.js";
import type { Kv } from "../../storage/kv.js";

export const ONBOARDING_CHECKPOINT_KEY = "onboarding.checkpoint.v1";

export type OnboardingCheckpointStage =
  | "address"
  | "issues"
  | "monitoring"
  | "accountability"
  | "api_key"
  | "api_keys_saved"
  | "complete";

export type OnboardingCheckpointReason =
  | "api_keys_restart"
  | "setup_progress";

export type OnboardingCheckpoint = {
  version: 1;
  stage: OnboardingCheckpointStage;
  updatedAtMs: number;
  reason: OnboardingCheckpointReason;
  savedKeys?: ApiKeyName[];
  lastPromptSummary?: string;
};

export type OnboardingCheckpointInput = Omit<
  OnboardingCheckpoint,
  "updatedAtMs" | "version"
>;

const STAGE_LABELS: Record<OnboardingCheckpointStage, string> = {
  address: "street address",
  issues: "issue stances",
  monitoring: "monitoring mode",
  accountability: "accountability preference",
  api_key: "API key setup",
  api_keys_saved: "gateway restart after saving API keys",
  complete: "complete",
};

export function getOnboardingCheckpoint(
  kv: Kv,
): OnboardingCheckpoint | null {
  const value = kv.get<Partial<OnboardingCheckpoint>>(ONBOARDING_CHECKPOINT_KEY);
  if (!value || value.version !== 1 || !value.stage || !value.reason) {
    return null;
  }
  return value as OnboardingCheckpoint;
}

export function setOnboardingCheckpoint(
  kv: Kv,
  input: OnboardingCheckpointInput,
): OnboardingCheckpoint {
  const checkpoint: OnboardingCheckpoint = {
    version: 1,
    updatedAtMs: Date.now(),
    ...input,
  };
  kv.set(ONBOARDING_CHECKPOINT_KEY, checkpoint);
  return checkpoint;
}

export function clearOnboardingCheckpoint(kv: Kv): void {
  kv.delete(ONBOARDING_CHECKPOINT_KEY);
}

export function describeOnboardingCheckpoint(
  checkpoint: OnboardingCheckpoint,
): string {
  if (checkpoint.reason === "api_keys_restart") {
    const keys = checkpoint.savedKeys?.length
      ? ` after saving ${checkpoint.savedKeys.join(", ")}`
      : "";
    return `Resume setup${keys}; next step: ${STAGE_LABELS[checkpoint.stage]}.`;
  }
  return `Setup in progress; next step: ${STAGE_LABELS[checkpoint.stage]}.`;
}

export function summarizeConfigureStage(
  stage: OnboardingCheckpointStage,
): string {
  return STAGE_LABELS[stage];
}
