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
 * Validation discipline: every body shape is parsed via TypeBox schemas
 * defined here using the safeParse helper from ../validation/typebox.ts.
 * On failure we return 400 with `details: { messages: string[] }` rather
 * than a thrown error. Domain helpers may still throw — those land as 500
 * with a generic message (we do not echo internal stack traces).
 */
import { Type } from "@sinclair/typebox";

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
import { safeParse } from "../validation/typebox.js";

export type MutationResult =
  | { ok: true; status: 200; body: unknown }
  | { ok: false; status: 400 | 404 | 409 | 500; body: { error: string; message: string; details?: unknown } };

const MonitoringModeLiteralSchema = Type.Union(
  MONITORING_MODE_VALUES.map((value) => Type.Literal(value)),
);
const AccountabilityLiteralSchema = Type.Union(
  ACCOUNTABILITY_VALUES.map((value) => Type.Literal(value)),
);
const ActionPromptingLiteralSchema = Type.Union(
  ACTION_PROMPTING_VALUES.map((value) => Type.Literal(value)),
);

const IssueStanceBodySchema = Type.Object({
  issue: Type.String({ minLength: 1 }),
  stance: Type.Union([
    Type.Literal("support"),
    Type.Literal("oppose"),
    Type.Literal("neutral"),
  ]),
  weight: Type.Optional(Type.Integer({ minimum: 1, maximum: 5 })),
});

const PreferencesUpdateSchema = Type.Object({
  address: Type.Optional(Type.String({ minLength: 1 })),
  zip: Type.Optional(Type.String()),
  state: Type.Optional(Type.String()),
  district: Type.Optional(Type.String()),
  monitoringMode: Type.Optional(MonitoringModeLiteralSchema),
  accountability: Type.Optional(AccountabilityLiteralSchema),
  actionPrompting: Type.Optional(ActionPromptingLiteralSchema),
  issueStances: Type.Optional(Type.Array(IssueStanceBodySchema)),
});

export type PreferencesUpdateBody = {
  address?: string;
  zip?: string;
  state?: string;
  district?: string;
  monitoringMode?: MonitoringMode;
  accountability?: AccountabilityMode;
  actionPrompting?: ActionPrompting;
  issueStances?: Array<{
    issue: string;
    stance: "support" | "oppose" | "neutral";
    weight?: number;
  }>;
};

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
  const parsed = safeParse(PreferencesUpdateSchema, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "preferences body failed validation",
        details: { messages: parsed.messages },
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

const MonitoringToggleSchema = Type.Object({
  enabled: Type.Boolean(),
});

export type MonitoringToggleBody = { enabled: boolean };

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
  const parsed = safeParse(MonitoringToggleSchema, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "monitoring toggle body failed validation",
        details: { messages: parsed.messages },
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

const StanceSignalBodySchema = Type.Object({
  billId: Type.String({ minLength: 1 }),
  direction: Type.Union([
    Type.Literal("agree"),
    Type.Literal("disagree"),
    Type.Literal("skip"),
  ]),
  weight: Type.Optional(Type.Number({ exclusiveMinimum: 0, maximum: 10 })),
});

export type StanceSignalBody = {
  billId: string;
  direction: "agree" | "disagree" | "skip";
  weight?: number;
};

/**
 * Records a single user stance signal from the dashboard's quick-vote UI.
 * `source` is forced to `"dashboard"` server-side so a client can't
 * masquerade as monitoring or onboarding telemetry.
 */
export function handleStanceSignalCreate(
  db: PolitiClawDb,
  raw: unknown,
): MutationResult {
  const parsed = safeParse(StanceSignalBodySchema, raw);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "stance signal body failed validation",
        details: { messages: parsed.messages },
      },
    };
  }
  try {
    const id = recordStanceSignal(db, {
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
        billId: parsed.data.billId,
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

const PackageFeedbackSchema = Type.Object({
  verdict: Type.Union([
    Type.Literal("useful"),
    Type.Literal("not_now"),
    Type.Literal("stop"),
  ]),
  note: Type.Optional(Type.String({ minLength: 1 })),
});

export type PackageFeedbackBody = {
  verdict: PackageFeedbackVerdict;
  note?: string;
};

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
  const parsed = safeParse(PackageFeedbackSchema, body);
  if (!parsed.ok) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "invalid_body",
        message: "package feedback body failed validation",
        details: { messages: parsed.messages },
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
