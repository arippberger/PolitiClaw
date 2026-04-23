/**
 * POST handlers for the editable dashboard.
 *
 * Each handler returns a `MutationResult` that the route registrar maps to
 * a JSON HTTP response. Handlers do NOT touch the response object directly —
 * the route layer owns the wire format. That keeps the handlers pure-ish and
 * easy to test in isolation.
 *
 * Authorisation posture: same as the read-only routes (`auth: "plugin"` —
 * gateway adds nothing). CSRF is enforced one layer up in `routes.ts`; if a
 * handler runs at all, the cookie+header double-submit already passed.
 *
 * Validation discipline: every body shape is parsed via zod schemas defined
 * here so an invalid request returns 400 with a structured `details` payload
 * rather than a thrown error. Domain helpers may still throw — those land as
 * 500 with a generic message (we do not echo internal stack traces).
 */
import { z } from "zod";

import {
  pauseMonitoring,
  resumeMonitoring,
  type MonitoringToggleResult,
} from "../cron/setup.js";
import {
  getActionPackage,
  recordPackageFeedback,
  type ActionPackageRow,
  type PackageFeedbackVerdict,
} from "../domain/actionMoments/index.js";
import {
  ACCOUNTABILITY_VALUES,
  ACTION_PROMPTING_VALUES,
  MONITORING_MODE_VALUES,
  recordStanceSignal,
  setAccountability,
  setActionPrompting,
  setMonitoringMode,
  upsertIssueStance,
  upsertPreferences,
  type AccountabilityMode,
  type ActionPrompting,
  type IssueStanceRow,
  type MonitoringMode,
  type PreferencesRow,
} from "../domain/preferences/index.js";
import {
  requestLetterRedraft,
  type RequestLetterRedraftResult,
} from "../domain/letters/index.js";
import type { PolitiClawDb } from "../storage/sqlite.js";

export type MutationResult =
  | { ok: true; status: 200; body: unknown }
  | { ok: false; status: 400 | 404 | 409 | 500; body: { error: string; message: string; details?: unknown } };

const PreferencesUpdateSchema = z.object({
  address: z.string().min(1).optional(),
  zip: z.string().trim().optional(),
  state: z.string().trim().optional(),
  district: z.string().trim().optional(),
  monitoringMode: z.enum(MONITORING_MODE_VALUES).optional(),
  accountability: z.enum(ACCOUNTABILITY_VALUES).optional(),
  actionPrompting: z.enum(ACTION_PROMPTING_VALUES).optional(),
  issueStances: z
    .array(
      z.object({
        issue: z.string().trim().min(1),
        stance: z.enum(["support", "oppose", "neutral"]),
        weight: z.number().int().min(1).max(5).optional(),
      }),
    )
    .optional(),
});

export type PreferencesUpdateBody = z.infer<typeof PreferencesUpdateSchema>;

export type PreferencesUpdateResult = {
  preferences: PreferencesRow | null;
  monitoringMode: MonitoringMode | null;
  accountability: AccountabilityMode | null;
  actionPrompting: ActionPrompting | null;
  upsertedIssueStances: IssueStanceRow[];
};

/**
 * Updates preferences from the dashboard. Mirrors the editable surface of
 * `politiclaw_configure` (address, monitoring mode, accountability, issue
 * stances) but does NOT trigger reps refresh or run onboarding flows — those
 * remain agent-only so the dashboard stays a thin edit surface, not an
 * alternate runtime.
 *
 * `issueStances` are upserted one by one so a partial failure on one stance
 * does not roll back the rest.
 */
export function handlePreferencesUpdate(
  db: PolitiClawDb,
  raw: unknown,
): MutationResult {
  const parsed = PreferencesUpdateSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "preferences body failed validation",
        details: parsed.error.flatten(),
      },
    };
  }
  const body = parsed.data;
  if (
    body.address === undefined &&
    body.monitoringMode === undefined &&
    body.accountability === undefined &&
    body.actionPrompting === undefined &&
    (body.issueStances === undefined || body.issueStances.length === 0)
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "empty_update",
        message:
          "at least one of address, monitoringMode, accountability, actionPrompting, or issueStances is required",
      },
    };
  }

  let updatedPrefs: PreferencesRow | null = null;
  let monitoringMode: MonitoringMode | null = null;
  let accountabilityResult: AccountabilityMode | null = null;
  let actionPromptingResult: ActionPrompting | null = null;

  const captureFromPrefs = (prefs: PreferencesRow) => {
    monitoringMode = prefs.monitoringMode;
    accountabilityResult = prefs.accountability;
    actionPromptingResult = prefs.actionPrompting;
  };

  try {
    if (body.address !== undefined) {
      updatedPrefs = upsertPreferences(db, {
        address: body.address,
        zip: body.zip,
        state: body.state,
        district: body.district,
        monitoringMode: body.monitoringMode,
        accountability: body.accountability,
        actionPrompting: body.actionPrompting,
      });
      captureFromPrefs(updatedPrefs);
    } else {
      if (body.monitoringMode !== undefined) {
        try {
          updatedPrefs = setMonitoringMode(db, body.monitoringMode);
          captureFromPrefs(updatedPrefs);
        } catch (err) {
          return {
            ok: false,
            status: 409,
            body: {
              error: "no_address_on_file",
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }
      if (body.accountability !== undefined) {
        try {
          updatedPrefs = setAccountability(db, body.accountability);
          captureFromPrefs(updatedPrefs);
        } catch (err) {
          return {
            ok: false,
            status: 409,
            body: {
              error: "no_address_on_file",
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }
      if (body.actionPrompting !== undefined) {
        try {
          updatedPrefs = setActionPrompting(db, body.actionPrompting);
          captureFromPrefs(updatedPrefs);
        } catch (err) {
          return {
            ok: false,
            status: 409,
            body: {
              error: "no_address_on_file",
              message: err instanceof Error ? err.message : String(err),
            },
          };
        }
      }
    }
  } catch (err) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "preferences_update_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }

  const upsertedIssueStances: IssueStanceRow[] = [];
  if (body.issueStances) {
    for (const stance of body.issueStances) {
      try {
        upsertedIssueStances.push(
          upsertIssueStance(db, {
            issue: stance.issue,
            stance: stance.stance,
            weight: stance.weight ?? 3,
          }),
        );
      } catch (err) {
        return {
          ok: false,
          status: 400,
          body: {
            error: "invalid_issue_stance",
            message: err instanceof Error ? err.message : String(err),
            details: { issue: stance.issue },
          },
        };
      }
    }
  }

  const result: PreferencesUpdateResult = {
    preferences: updatedPrefs,
    monitoringMode,
    accountability: accountabilityResult,
    actionPrompting: actionPromptingResult,
    upsertedIssueStances,
  };
  return { ok: true, status: 200, body: result };
}

const MonitoringToggleSchema = z.object({
  enabled: z.boolean(),
});

export type MonitoringToggleBody = z.infer<typeof MonitoringToggleSchema>;

/**
 * Bulk-toggle the entire PolitiClaw cron set on or off. Handlers don't touch
 * jobs the user authored — `pauseMonitoring`/`resumeMonitoring` filter to
 * `politiclaw.*` names internally. Returns the per-job outcome so the
 * dashboard can render which jobs actually flipped vs. were already in the
 * target state.
 */
export async function handleMonitoringToggle(
  raw: unknown,
): Promise<MutationResult> {
  const parsed = MonitoringToggleSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "monitoring toggle body failed validation",
        details: parsed.error.flatten(),
      },
    };
  }
  let result: MonitoringToggleResult;
  try {
    result = parsed.data.enabled
      ? await resumeMonitoring()
      : await pauseMonitoring();
  } catch (err) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "monitoring_toggle_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  return { ok: true, status: 200, body: result };
}

const StanceSignalSchema = z
  .object({
    issue: z.string().trim().min(1).optional(),
    billId: z.string().trim().min(1).optional(),
    direction: z.enum(["agree", "disagree", "skip"]),
    weight: z.number().positive().max(10).optional(),
  })
  .refine((v) => v.issue !== undefined || v.billId !== undefined, {
    message: "one of issue or billId is required",
  });

export type StanceSignalBody = z.infer<typeof StanceSignalSchema>;

/**
 * Records a single user stance signal from the dashboard's quick-vote UI.
 * `source` is forced to `"dashboard"` server-side so a client can't
 * masquerade as monitoring or onboarding telemetry.
 */
export function handleStanceSignalCreate(
  db: PolitiClawDb,
  raw: unknown,
): MutationResult {
  const parsed = StanceSignalSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "stance signal body failed validation",
        details: parsed.error.flatten(),
      },
    };
  }
  try {
    const id = recordStanceSignal(db, {
      issue: parsed.data.issue,
      billId: parsed.data.billId,
      direction: parsed.data.direction,
      weight: parsed.data.weight ?? 1,
      source: "dashboard",
    });
    return {
      ok: true,
      status: 200,
      body: {
        id,
        billId: parsed.data.billId ?? null,
        issue: parsed.data.issue ?? null,
        direction: parsed.data.direction,
      },
    };
  } catch (err) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "stance_signal_create_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
}

export function handleLetterRedraft(
  db: PolitiClawDb,
  letterId: number,
): MutationResult {
  if (!Number.isInteger(letterId) || letterId <= 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_letter_id",
        message: "letter id must be a positive integer",
      },
    };
  }
  let result: RequestLetterRedraftResult;
  try {
    result = requestLetterRedraft(db, letterId);
  } catch (err) {
    return {
      ok: false,
      status: 500,
      body: {
        error: "letter_redraft_failed",
        message: err instanceof Error ? err.message : String(err),
      },
    };
  }
  if (result.status === "not_found") {
    return {
      ok: false,
      status: 404,
      body: {
        error: "letter_not_found",
        message: `no letter with id ${letterId}`,
      },
    };
  }
  return { ok: true, status: 200, body: result };
}

const PackageFeedbackSchema = z.object({
  verdict: z.enum(["useful", "not_now", "stop"]),
  note: z.string().trim().min(1).optional(),
});

export type PackageFeedbackBody = z.infer<typeof PackageFeedbackSchema>;

export type PackageFeedbackResult = {
  package: ActionPackageRow;
  verdict: PackageFeedbackVerdict;
};

/**
 * Dashboard feedback handler. Both `/feedback` (accepts any verdict) and
 * `/dismiss` (forces `verdict='not_now'` when the body omits one) route
 * through here so the dashboard's "Not now" button can be a minimal POST
 * with no payload.
 */
export function handlePackageFeedback(
  db: PolitiClawDb,
  packageId: number,
  raw: unknown,
  defaultVerdict?: PackageFeedbackVerdict,
): MutationResult {
  if (!Number.isInteger(packageId) || packageId <= 0) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_package_id",
        message: "package id must be a positive integer",
      },
    };
  }
  const body =
    raw === undefined || raw === null
      ? { verdict: defaultVerdict }
      : typeof raw === "object" && !Array.isArray(raw)
        ? { verdict: defaultVerdict, ...(raw as Record<string, unknown>) }
        : raw;
  const parsed = PackageFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "package feedback body failed validation",
        details: parsed.error.flatten(),
      },
    };
  }
  const existing = getActionPackage(db, packageId);
  if (!existing) {
    return {
      ok: false,
      status: 404,
      body: {
        error: "package_not_found",
        message: `no action package with id ${packageId}`,
      },
    };
  }
  const result = recordPackageFeedback(db, {
    packageId,
    verdict: parsed.data.verdict,
    note: parsed.data.note,
  });
  if (result.status === "not_found") {
    return {
      ok: false,
      status: 404,
      body: {
        error: "package_not_found",
        message: result.reason,
      },
    };
  }
  const body200: PackageFeedbackResult = {
    package: result.package,
    verdict: parsed.data.verdict,
  };
  return { ok: true, status: 200, body: body200 };
}
