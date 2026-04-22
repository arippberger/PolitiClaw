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
  recordStanceSignal,
  setMonitoringCadence,
  upsertIssueStance,
  upsertPreferences,
  type IssueStanceRow,
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
  monitoringCadence: z
    .enum(["off", "election_proximity", "weekly", "both"])
    .optional(),
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
  cadence: PreferencesRow["monitoringCadence"] | null;
  upsertedIssueStances: IssueStanceRow[];
};

/**
 * Updates preferences from the dashboard. Mirrors the editable surface of
 * `politiclaw_configure` (address, cadence, issue stances) but does NOT
 * trigger reps refresh or run onboarding flows — those remain agent-only so
 * the dashboard stays a thin edit surface, not an alternate runtime.
 *
 * Either `address` (full prefs upsert) or `monitoringCadence` (cadence-only
 * tweak) may be present; both are optional. `issueStances` are upserted one
 * by one so a partial failure on one stance does not roll back the rest.
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
    body.monitoringCadence === undefined &&
    (body.issueStances === undefined || body.issueStances.length === 0)
  ) {
    return {
      ok: false,
      status: 400,
      body: {
        error: "empty_update",
        message:
          "at least one of address, monitoringCadence, or issueStances is required",
      },
    };
  }

  let updatedPrefs: PreferencesRow | null = null;
  let cadence: PreferencesRow["monitoringCadence"] | null = null;

  try {
    if (body.address !== undefined) {
      updatedPrefs = upsertPreferences(db, {
        address: body.address,
        zip: body.zip,
        state: body.state,
        district: body.district,
        monitoringCadence: body.monitoringCadence,
      });
      cadence = updatedPrefs.monitoringCadence ?? null;
    } else if (body.monitoringCadence !== undefined) {
      try {
        updatedPrefs = setMonitoringCadence(db, body.monitoringCadence);
        cadence = updatedPrefs.monitoringCadence ?? null;
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
    cadence,
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
