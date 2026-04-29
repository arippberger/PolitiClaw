/**
 * Declarative PolitiClaw cron templates.
 *
 * These describe the default monitoring jobs installed by
 * `politiclaw_configure` (via `reconcileCronJobs`). Each template carries a
 * stable, namespaced `name` so re-runs are idempotent (we match existing cron
 * jobs by name and upsert in-place).
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
 *   users can retune behavior without a plugin rebuild.
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
    "dissenting-view item, and any source outages from the " +
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
      "Honor the tool's tier grouping: tier-1 items get the full Class-A render, " +
      "tier-2 items get the one-line digest render, tier-3 is the tail count. " +
      "Required: include the 'Things you might be surprised by' dissenting-view " +
      "section. If the delta is empty, post the one-line quiet-week " +
      "message per the skill — do not pad.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const REP_VOTE_WATCH_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.rep_vote_watch",
  description:
    "Every 6h: checks for new or materially changed federal bills and " +
    "committee events affecting tracked issues (change-detection-gated, so " +
    "quiet windows produce no output). Pair with politiclaw_ingest_votes " +
    "for tier-1 House and tier-2 Senate roll calls.",
  schedule: { kind: "every", everyMs: 6 * MS_IN_HOUR },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw rep-vote watch. Read the politiclaw-monitoring skill. " +
      "Call politiclaw_check_upcoming_votes with the default (recent) window. " +
      "Surface only tier-1 interruptive items (Class A for bills, Class B for " +
      "events) plus any Class C rep-vote misalignments. Tier-2 and tail items " +
      "roll into the weekly digest — do not duplicate them here. If the tool " +
      "returns no tier-1 items, post the one-line silent-ok message per the " +
      "skill — do not pad. Prioritize bill-status deltas and committee activity " +
      "unless politiclaw_ingest_votes has populated House and Senate roll calls.",
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
      "skill. Call politiclaw_check_upcoming_votes. Surface only tier-1 " +
      "interruptive events (Class B, near-term hearings on tier-1 bills). " +
      "Tier-2 hearings roll into the weekly digest — do not duplicate them " +
      "here. If the tool returns no tier-1 items, post the one-line " +
      "silent-ok message per the skill — do not pad.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const REP_REPORT_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.rep_report",
  description:
    "Every ~30 days: deterministic representative alignment digest vs. declared " +
    "issue stances and recorded bill signals across House (api.congress.gov) and " +
    "Senate (voteview.com) roll calls. Calls politiclaw_rep_report; keeps the " +
    "alignment disclaimer, dissenting-view coverage, and blind-spot callouts intact.",
  schedule: { kind: "every", everyMs: MS_IN_MONTH },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw periodic representative alignment report. Read " +
      "skills/politiclaw-monitoring/SKILL.md → Rep report (periodic digest). " +
      "Call politiclaw_rep_report once. Render misaligned votes as Class C " +
      "items (one per misalignment) and bundle aligned votes to a count per " +
      "rep. Include the dissenting-view requirement where applicable; never " +
      "strip the alignment disclaimer footer from tool output when scores are " +
      "shown. If the tool returns no_stances or no_reps, post only the " +
      "actionable fix.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const ELECTION_PROXIMITY_ALERT_TEMPLATE: PolitiClawCronTemplate = {
  name: "politiclaw.election_proximity_alert",
  description:
    "Daily: when an election is within 30/14/7/1 days of the saved address, " +
    "ramps a short alert ('election in N days') and points at " +
    "politiclaw_election_brief. Silent on days that do not " +
    "cross a threshold.",
  schedule: { kind: "every", everyMs: MS_IN_DAY },
  sessionTarget: "isolated",
  wakeMode: "next-heartbeat",
  payload: {
    kind: "agentTurn",
    message:
      "Run the PolitiClaw election-proximity check. Read " +
      "skills/politiclaw-monitoring/SKILL.md → Election proximity alerts. " +
      "Call politiclaw_get_my_ballot to read the next election date for the " +
      "saved address. If the election is 30, 14, 7, or 1 day away, post one " +
      "Class-D line ('Election in N days at <polling place or address>') and " +
      "recommend politiclaw_election_brief. On other days " +
      "post nothing.",
  },
  delivery: { mode: "announce", channel: "last" },
};

export const POLITICLAW_CRON_TEMPLATES: readonly PolitiClawCronTemplate[] = [
  WEEKLY_SUMMARY_TEMPLATE,
  REP_VOTE_WATCH_TEMPLATE,
  TRACKED_HEARINGS_TEMPLATE,
  REP_REPORT_TEMPLATE,
  ELECTION_PROXIMITY_ALERT_TEMPLATE,
];

export const POLITICLAW_CRON_NAMES: readonly string[] =
  POLITICLAW_CRON_TEMPLATES.map((template) => template.name);

import type { MonitoringMode } from "../domain/preferences/types.js";

export type { MonitoringMode };

/**
 * Returns the subset of default templates that should be **installed and
 * enabled** for a given user monitoring mode. Templates absent from the
 * returned list are paused by `setupMonitoring()` (not deleted — preserves
 * gateway state if the user flips back).
 *
 * Mode semantics:
 * - `off`: no automated monitoring.
 * - `quiet_watch`: silent background change-watches only (rep-vote + hearings,
 *   both change-detection-gated, so quiet windows produce no output).
 * - `weekly_digest`: weekly summary (every 7 days from install) + monthly rep
 *   report, plus the background change-watches. No election ramp-up.
 * - `action_only`: quiet background watches plus election proximity alerts.
 *   Suppresses the weekly summary and rep report.
 * - `full_copilot`: everything — digest, rep report, election alerts, watches.
 */
export function templatesForMode(
  mode: MonitoringMode,
): readonly PolitiClawCronTemplate[] {
  switch (mode) {
    case "off":
      return [];
    case "quiet_watch":
      return [REP_VOTE_WATCH_TEMPLATE, TRACKED_HEARINGS_TEMPLATE];
    case "weekly_digest":
      return [
        REP_VOTE_WATCH_TEMPLATE,
        TRACKED_HEARINGS_TEMPLATE,
        WEEKLY_SUMMARY_TEMPLATE,
        REP_REPORT_TEMPLATE,
      ];
    case "action_only":
      return [
        REP_VOTE_WATCH_TEMPLATE,
        TRACKED_HEARINGS_TEMPLATE,
        ELECTION_PROXIMITY_ALERT_TEMPLATE,
      ];
    case "full_copilot":
      return POLITICLAW_CRON_TEMPLATES;
  }
}
