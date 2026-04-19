/**
 * Declarative PolitiClaw cron templates.
 *
 * These describe the default monitoring jobs installed by
 * `politiclaw_setup_monitoring`. Each template carries a stable, namespaced
 * `name` so re-runs are idempotent (we match existing cron jobs by name and
 * upsert in-place).
 *
 * Implementation posture:
 * - Every job uses `sessionTarget: "isolated"` so the monitoring turn has a
 *   fresh context window and cannot pollute the main user session.
 * - Delivery is `announce` to the last active channel — the monitoring
 *   message surfaces wherever the user last talked to PolitiClaw.
 * - `wakeMode: "next-heartbeat"` lets the gateway batch runs; jobs that must
 *   fire at a precise instant would use `"now"`, but monitoring does not.
 * - Messages are intentionally short. Behavior lives in the
 *   `politiclaw-monitoring` and `politiclaw-summary` skills, which the agent
 *   loads when each job fires. Keeping messages short and skills long means
 *   users can retune behavior without a plugin rebuild (docs/plan.md
 *   Phase 4 exit criteria).
 */

const MS_IN_HOUR = 60 * 60 * 1000;
const MS_IN_DAY = 24 * MS_IN_HOUR;
/** Approximate lunar month cadence — month boundaries vary; 30d is intentional. */
const MS_IN_MONTH = 30 * MS_IN_DAY;

export type CronTemplateSchedule =
  | { kind: "every"; everyMs: number }
  | { kind: "cron"; expr: string; tz?: string };

export type CronTemplateDelivery = {
  mode: "announce";
  channel: "last" | string;
};

export type CronTemplatePayload = {
  kind: "agentTurn";
  message: string;
};

export type PolitiClawCronTemplate = {
  name: string;
  description: string;
  schedule: CronTemplateSchedule;
  sessionTarget: "main" | "isolated" | "current";
  wakeMode: "next-heartbeat" | "now";
  payload: CronTemplatePayload;
  delivery: CronTemplateDelivery;
};

export const WEEKLY_SUMMARY_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.weekly_summary",
  description:
    "PolitiClaw weekly digest. Reads the politiclaw-summary skill and posts a " +
    "single message with tracked-bill movement, upcoming events, a mandatory " +
    "dissenting-view item (docs/risks.md §4), and any source outages from the " +
    "past 7 days.",
  schedule: { kind: "every", everyMs: 7 * MS_IN_DAY },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw weekly summary. Read the politiclaw-summary skill " +
      "and follow its section order exactly. Call politiclaw_check_upcoming_votes " +
      "with a 7-day window, then compose the digest per skills/politiclaw-summary/SKILL.md. " +
      "Required: include the 'Things you might be surprised by' dissenting-view " +
      "section (docs/risks.md §4). If the delta is empty, post the one-line quiet-week " +
      "message per the skill — do not pad.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const REP_VOTE_WATCH_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.rep_vote_watch",
  description:
    "Every 6h: checks for new or materially changed federal bills and " +
    "committee events affecting tracked issues (change-detection-gated, so " +
    "quiet windows produce no output). Pair with politiclaw_ingest_house_votes " +
    "for tier-1 House roll calls; senators remain limited until Senate ingest lands.",
  schedule: { kind: "every", everyMs: 6 * MS_IN_HOUR },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw rep-vote watch. Read the politiclaw-monitoring skill. " +
      "Call politiclaw_check_upcoming_votes with the default (recent) window. " +
      "Only surface bills flagged as [new] or [changed] whose alignment crosses " +
      "the confidence floor. If the delta is empty, post the one-line silent-ok " +
      "message per the skill — do not pad. Senate roll-call ingest is still " +
      "limited (Phase 5a deviations); prioritize bill-status deltas and committee " +
      "activity unless politiclaw_ingest_house_votes has populated House votes.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const TRACKED_HEARINGS_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.tracked_hearings",
  description:
    "Every 12h: surfaces newly-scheduled committee hearings and markups " +
    "whose related bills touch the user's declared issue stances. Silent when " +
    "no tracked issues are on upcoming committee agendas.",
  schedule: { kind: "every", everyMs: 12 * MS_IN_HOUR },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw tracked-hearings sweep. Read the politiclaw-monitoring " +
      "skill. Call politiclaw_check_upcoming_votes and surface only upcoming " +
      "committee events whose relatedBillIds overlap a tracked bill, or bills " +
      "whose alignment crosses the confidence floor against declared stances. " +
      "If the delta contains no tracked-issue matches, post the one-line " +
      "silent-ok message per the skill — do not pad.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const REP_REPORT_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.rep_report",
  description:
    "Every ~30 days: deterministic representative alignment digest vs. declared " +
    "issue stances and recorded bill signals (House roll calls only until Senate " +
    "ingest lands). Calls politiclaw_rep_report; honors docs/risks.md sections 1, 4, and 8.",
  schedule: { kind: "every", everyMs: MS_IN_MONTH },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw periodic representative alignment report. Read skills/politiclaw-monitoring/SKILL.md → Rep report (periodic digest). Call politiclaw_rep_report once. Include the dissenting-view obligation where applicable (docs/risks.md section 4); never strip the alignment disclaimer footer from tool output when scores are shown. If the tool returns no_stances or no_reps, post only the actionable fix.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const POLITICLAW_CRON_TEMPLATES: readonly PolitiClawCronTemplate[] = [
  WEEKLY_SUMMARY_TEMPLATE,
  REP_VOTE_WATCH_TEMPLATE,
  TRACKED_HEARINGS_TEMPLATE,
  REP_REPORT_TEMPLATE,
];

export const POLITICLAW_CRON_NAMES: readonly string[] =
  POLITICLAW_CRON_TEMPLATES.map((template) => template.name);
