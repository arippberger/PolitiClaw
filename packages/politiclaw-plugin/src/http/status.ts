/**
 * Status payload builder for the read-only dashboard.
 *
 * Composes plugin-DB reads + the gateway cron list into a single JSON object
 * consumed by `src/http/public/app.js`. No remote data-source fetches: the
 * ballot preview reads only from the cached `ballots` row, and rep alignment
 * is computed from data already in the DB. That keeps pageload cheap and
 * avoids surprising the user with API calls just by opening a browser tab.
 *
 * Degrade-gracefully discipline: every section returns a typed status enum
 * (`ok` / `missing` / `unavailable` / `cache_miss` / `none`) rather than
 * throwing, mirroring the doctor tool. The dashboard renders the exact
 * reason/actionable hint so a broken section never blocks the rest.
 */
import type { PolitiClawDb } from "../storage/sqlite.js";
import type { GatewayCronAdapter, GatewayCronJob } from "../cron/gatewayAdapter.js";
import type { PreferencesRow, IssueStanceRow } from "../domain/preferences/index.js";
import {
  getPreferences,
  listIssueStances,
} from "../domain/preferences/index.js";
import { listReps, type StoredRep } from "../domain/reps/index.js";
import {
  scoreRepresentative,
  type RepIssueAlignment,
} from "../domain/scoring/index.js";
import { POLITICLAW_CRON_NAMES } from "../cron/templates.js";
import { listRecentAlerts, type AlertKind } from "../domain/alerts/index.js";
import { listLetters, type LetterListEntry } from "../domain/letters/index.js";
import { listRecentBillVotes, type RecentBillVote } from "../domain/votes/ingest.js";

export const STATUS_SCHEMA_VERSION = 4 as const;
export const UPCOMING_ELECTION_WINDOW_DAYS = 60;
export const RECENT_ALERTS_LIMIT = 10;
export const RECENT_LETTERS_LIMIT = 10;
export const RECENT_VOTES_LIMIT = 10;

export type StatusPreferences =
  | {
      status: "ok";
      address: string;
      zip: string | null;
      state: string | null;
      district: string | null;
      monitoringMode: string;
      accountability: string;
      updatedAtMs: number;
      issueStances: {
        issue: string;
        stance: IssueStanceRow["stance"];
        weight: number;
        updatedAtMs: number;
      }[];
    }
  | {
      status: "missing";
      reason: string;
      actionable: string;
    };

export type StatusRepAlignment =
  | {
      status: "ok";
      aggregateScore: number;
      aggregateConfidence: number;
      consideredVoteCount: number;
      perIssue: {
        issue: string;
        stance: RepIssueAlignment["stance"];
        alignmentScore: number;
        confidence: number;
        alignedCount: number;
        conflictedCount: number;
        belowConfidenceFloor: boolean;
      }[];
    }
  | { status: "no_stances"; reason: string }
  | { status: "insufficient_data"; reason: string };

export type StatusRep = {
  id: string;
  name: string;
  office: string;
  party: string | null;
  state: string | null;
  district: string | null;
  lastSyncedMs: number;
  sourceAdapterId: string;
  sourceTier: number;
  alignment: StatusRepAlignment;
};

export type StatusReps =
  | { status: "ok"; reps: StatusRep[] }
  | { status: "no_preferences"; reason: string; actionable: string }
  | { status: "none"; reason: string; actionable: string };

export type StatusCronJob = {
  name: string;
  enabled: boolean;
  scheduleSummary: string;
  sessionTarget: string;
  updatedAtMs: number | null;
};

export type StatusMonitoring =
  | { status: "ok"; jobs: StatusCronJob[] }
  | { status: "unavailable"; reason: string; actionable?: string };

export type StatusUpcomingElection =
  | {
      status: "ok";
      electionName: string | null;
      electionDay: string;
      daysUntil: number;
      contestCount: number;
      pollingLocationName: string | null;
      pollingAddress: string | null;
    }
  | { status: "none"; reason: string }
  | { status: "no_preferences"; reason: string; actionable: string }
  | { status: "cache_miss"; reason: string; actionable: string };

export type StatusRecentAlert = {
  id: number;
  createdAtMs: number;
  kind: AlertKind;
  refId: string;
  changeReason: string;
  summary: string;
  sourceAdapterId: string;
  sourceTier: number;
};

export type StatusRecentAlerts =
  | { status: "ok"; alerts: StatusRecentAlert[] }
  | { status: "none"; reason: string };

export type StatusRecentLetter = {
  id: number;
  repId: string;
  repName: string;
  repOffice: string;
  issue: string;
  billId: string | null;
  subject: string;
  wordCount: number;
  createdAtMs: number;
  redraftRequestedAtMs: number | null;
};

export type StatusRecentLetters =
  | { status: "ok"; letters: StatusRecentLetter[] }
  | { status: "none"; reason: string };

export type StatusRecentVote = {
  voteId: string;
  billId: string;
  billTitle: string | null;
  chamber: "House" | "Senate";
  result: string | null;
  voteQuestion: string | null;
  startDate: string | null;
};

export type StatusRecentVotes =
  | { status: "ok"; votes: StatusRecentVote[] }
  | { status: "none"; reason: string };

export type StatusPayload = {
  schemaVersion: typeof STATUS_SCHEMA_VERSION;
  generatedAtMs: number;
  preferences: StatusPreferences;
  reps: StatusReps;
  monitoring: StatusMonitoring;
  upcomingElection: StatusUpcomingElection;
  recentAlerts: StatusRecentAlerts;
  recentLetters: StatusRecentLetters;
  recentVotes: StatusRecentVotes;
};

export type BuildStatusDeps = {
  db: PolitiClawDb;
  cronAdapter?: GatewayCronAdapter;
  now?: () => number;
};

export async function buildStatusPayload(deps: BuildStatusDeps): Promise<StatusPayload> {
  const now = deps.now ?? Date.now;
  const generatedAtMs = now();

  const preferencesRow = getPreferences(deps.db);
  const preferences = buildPreferencesSection(deps.db, preferencesRow);
  const reps = buildRepsSection(deps.db, preferencesRow);
  const monitoring = await buildMonitoringSection(deps.cronAdapter);
  const upcomingElection = buildUpcomingElectionSection(deps.db, preferencesRow, generatedAtMs);
  const recentAlerts = buildRecentAlertsSection(deps.db);
  const recentLetters = buildRecentLettersSection(deps.db);
  const recentVotes = buildRecentVotesSection(deps.db);

  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    generatedAtMs,
    preferences,
    reps,
    monitoring,
    upcomingElection,
    recentAlerts,
    recentLetters,
    recentVotes,
  };
}

function buildRecentAlertsSection(db: PolitiClawDb): StatusRecentAlerts {
  const rows = listRecentAlerts(db, { limit: RECENT_ALERTS_LIMIT });
  if (rows.length === 0) {
    return {
      status: "none",
      reason: "no alerts recorded yet — they appear here after politiclaw_check_upcoming_votes finds a new or changed item",
    };
  }
  return {
    status: "ok",
    alerts: rows.map((row) => ({
      id: row.id,
      createdAtMs: row.createdAt,
      kind: row.kind,
      refId: row.refId,
      changeReason: row.changeReason,
      summary: row.summary,
      sourceAdapterId: row.sourceAdapterId,
      sourceTier: row.sourceTier,
    })),
  };
}

function buildRecentLettersSection(db: PolitiClawDb): StatusRecentLetters {
  const rows = listLetters(db, RECENT_LETTERS_LIMIT);
  if (rows.length === 0) {
    return {
      status: "none",
      reason: "no letters drafted yet — call politiclaw_draft_letter to write one",
    };
  }
  return {
    status: "ok",
    letters: rows.map(toStatusLetter),
  };
}

function toStatusLetter(row: LetterListEntry): StatusRecentLetter {
  return {
    id: row.id,
    repId: row.repId,
    repName: row.repName,
    repOffice: row.repOffice,
    issue: row.issue,
    billId: row.billId,
    subject: row.subject,
    wordCount: row.wordCount,
    createdAtMs: row.createdAt,
    redraftRequestedAtMs: row.redraftRequestedAt,
  };
}

function buildRecentVotesSection(db: PolitiClawDb): StatusRecentVotes {
  const rows = listRecentBillVotes(db, RECENT_VOTES_LIMIT);
  if (rows.length === 0) {
    return {
      status: "none",
      reason:
        "no roll-call votes ingested yet — call politiclaw_ingest_votes to populate",
    };
  }
  return {
    status: "ok",
    votes: rows.map(toStatusVote),
  };
}

function toStatusVote(row: RecentBillVote): StatusRecentVote {
  return {
    voteId: row.voteId,
    billId: row.billId,
    billTitle: row.billTitle,
    chamber: row.chamber,
    result: row.result,
    voteQuestion: row.voteQuestion,
    startDate: row.startDate,
  };
}

function buildPreferencesSection(
  db: PolitiClawDb,
  prefs: PreferencesRow | null,
): StatusPreferences {
  if (!prefs) {
    return {
      status: "missing",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    };
  }
  const stances = listIssueStances(db).map((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
    updatedAtMs: row.updatedAt,
  }));
  return {
    status: "ok",
    address: prefs.address,
    zip: prefs.zip ?? null,
    state: prefs.state ?? null,
    district: prefs.district ?? null,
    monitoringMode: prefs.monitoringMode ?? "action_only",
    accountability: prefs.accountability,
    updatedAtMs: prefs.updatedAt,
    issueStances: stances,
  };
}

function buildRepsSection(
  db: PolitiClawDb,
  prefs: PreferencesRow | null,
): StatusReps {
  if (!prefs) {
    return {
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    };
  }
  const stored = listReps(db);
  if (stored.length === 0) {
    return {
      status: "none",
      reason: "no reps resolved yet",
      actionable: "call politiclaw_get_my_reps to populate",
    };
  }
  return {
    status: "ok",
    reps: stored.map((rep) => ({
      id: rep.id,
      name: rep.name,
      office: rep.office,
      party: rep.party ?? null,
      state: rep.state ?? null,
      district: rep.district ?? null,
      lastSyncedMs: rep.lastSynced,
      sourceAdapterId: rep.sourceAdapterId,
      sourceTier: rep.sourceTier,
      alignment: computeStatusAlignment(db, rep),
    })),
  };
}

function computeStatusAlignment(db: PolitiClawDb, rep: StoredRep): StatusRepAlignment {
  const result = scoreRepresentative(db, rep.id);
  if (result.status === "no_stances") {
    return { status: "no_stances", reason: result.reason };
  }
  if (result.status === "rep_not_found") {
    return {
      status: "insufficient_data",
      reason: "rep disappeared between listReps and scoreRepresentative",
    };
  }
  if (result.consideredVoteCount === 0 || result.perIssue.length === 0) {
    return {
      status: "insufficient_data",
      reason:
        "no recorded votes match declared stances yet " +
        "(ingest House roll calls or record stance signals to broaden coverage)",
    };
  }
  const scoredIssues = result.perIssue.filter(
    (entry) => entry.consideredCount > 0 && !entry.belowConfidenceFloor,
  );
  const aggregate = aggregateAlignment(result.perIssue);
  if (!aggregate) {
    return {
      status: "insufficient_data",
      reason: "all per-issue scores fell below the confidence floor",
    };
  }
  return {
    status: "ok",
    aggregateScore: aggregate.score,
    aggregateConfidence: aggregate.confidence,
    consideredVoteCount: result.consideredVoteCount,
    perIssue: scoredIssues.map((entry) => ({
      issue: entry.issue,
      stance: entry.stance,
      alignmentScore: entry.alignmentScore,
      confidence: entry.confidence,
      alignedCount: entry.alignedCount,
      conflictedCount: entry.conflictedCount,
      belowConfidenceFloor: entry.belowConfidenceFloor,
    })),
  };
}

function aggregateAlignment(
  perIssue: readonly RepIssueAlignment[],
): { score: number; confidence: number } | null {
  const usable = perIssue.filter(
    (entry) => entry.consideredCount > 0 && !entry.belowConfidenceFloor,
  );
  if (usable.length === 0) return null;
  let weightedScore = 0;
  let weightedConfidence = 0;
  let weightSum = 0;
  for (const entry of usable) {
    const weight = Math.max(entry.stanceWeight, 0);
    if (weight === 0) continue;
    weightedScore += entry.alignmentScore * weight;
    weightedConfidence += entry.confidence * weight;
    weightSum += weight;
  }
  if (weightSum === 0) return null;
  return {
    score: weightedScore / weightSum,
    confidence: weightedConfidence / weightSum,
  };
}

async function buildMonitoringSection(
  cronAdapter: GatewayCronAdapter | undefined,
): Promise<StatusMonitoring> {
  if (!cronAdapter) {
    return {
      status: "unavailable",
      reason: "cron adapter not available in this context",
      actionable: "open the dashboard from a running OpenClaw gateway",
    };
  }
  try {
    const jobs = await cronAdapter.list({ includeDisabled: true });
    const politiclawNames = new Set(POLITICLAW_CRON_NAMES);
    const ours = jobs
      .filter((job) => politiclawNames.has(job.name))
      .map(normalizeCronJob);
    return { status: "ok", jobs: ours };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      status: "unavailable",
      reason: `gateway cron.list failed: ${message}`,
      actionable: "check gateway connectivity or run politiclaw_doctor",
    };
  }
}

function normalizeCronJob(job: GatewayCronJob): StatusCronJob {
  return {
    name: job.name,
    enabled: job.enabled,
    scheduleSummary: summarizeSchedule(job.schedule),
    sessionTarget: job.sessionTarget,
    updatedAtMs: job.updatedAtMs ?? job.createdAtMs ?? null,
  };
}

function summarizeSchedule(schedule: GatewayCronJob["schedule"]): string {
  switch (schedule.kind) {
    case "every":
      return `every ${formatDuration(schedule.everyMs)}`;
    case "at":
      return `at ${schedule.at}`;
    case "cron":
      return schedule.tz
        ? `cron: ${schedule.expr} (${schedule.tz})`
        : `cron: ${schedule.expr}`;
    default: {
      const _exhaustive: never = schedule;
      void _exhaustive;
      return "unknown schedule";
    }
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return `${ms}ms`;
  const days = ms / 86_400_000;
  if (days >= 1 && Number.isInteger(days)) return `${days}d`;
  const hours = ms / 3_600_000;
  if (hours >= 1 && Number.isInteger(hours)) return `${hours}h`;
  const minutes = ms / 60_000;
  if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes}m`;
  if (days >= 1) return `${days.toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  return `${Math.round(ms / 1000)}s`;
}

function buildUpcomingElectionSection(
  db: PolitiClawDb,
  prefs: PreferencesRow | null,
  nowMs: number,
): StatusUpcomingElection {
  if (!prefs) {
    return {
      status: "no_preferences",
      reason: "no address on file",
      actionable: "call politiclaw_configure first",
    };
  }

  const row = db
    .prepare(
      `SELECT election_json, contests_json, logistics_json
         FROM ballots
        ORDER BY fetched_at DESC
        LIMIT 1`,
    )
    .get() as
    | {
        election_json: string | null;
        contests_json: string;
        logistics_json: string;
      }
    | undefined;

  if (!row) {
    return {
      status: "cache_miss",
      reason: "no cached ballot snapshot",
      actionable: "call politiclaw_get_my_ballot to populate",
    };
  }

  if (!row.election_json) {
    return { status: "none", reason: "cached ballot has no election metadata" };
  }

  const election = JSON.parse(row.election_json) as {
    id?: string;
    name?: string;
    electionDay?: string;
  };
  if (!election.electionDay) {
    return { status: "none", reason: "cached ballot has no election day" };
  }

  const daysUntil = daysBetween(election.electionDay, nowMs);
  if (daysUntil === null) {
    return { status: "none", reason: `unparseable electionDay '${election.electionDay}'` };
  }
  if (daysUntil < 0) {
    return { status: "none", reason: `last cached election (${election.electionDay}) has passed` };
  }
  if (daysUntil > UPCOMING_ELECTION_WINDOW_DAYS) {
    return {
      status: "none",
      reason: `next election (${election.electionDay}) is more than ${UPCOMING_ELECTION_WINDOW_DAYS} days away`,
    };
  }

  const contests = JSON.parse(row.contests_json) as unknown[];
  const logistics = JSON.parse(row.logistics_json) as {
    primaryPolling?: {
      locationName?: string;
      line1?: string;
      city?: string;
      state?: string;
      zip?: string;
    } | null;
  };
  const polling = logistics.primaryPolling ?? null;
  const pollingAddress = polling
    ? [polling.line1, polling.city, polling.state, polling.zip]
        .filter((part): part is string => Boolean(part && part.trim()))
        .join(", ") || null
    : null;

  return {
    status: "ok",
    electionName: election.name ?? null,
    electionDay: election.electionDay,
    daysUntil,
    contestCount: Array.isArray(contests) ? contests.length : 0,
    pollingLocationName: polling?.locationName ?? null,
    pollingAddress,
  };
}

function daysBetween(isoDate: string, nowMs: number): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return null;
  const electionMs = Date.UTC(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  const nowUtcMidnight = Date.UTC(
    new Date(nowMs).getUTCFullYear(),
    new Date(nowMs).getUTCMonth(),
    new Date(nowMs).getUTCDate(),
  );
  return Math.round((electionMs - nowUtcMidnight) / 86_400_000);
}
