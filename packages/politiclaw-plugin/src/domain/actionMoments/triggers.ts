import { createHash } from "node:crypto";

import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { UpcomingEvent } from "../../sources/upcomingVotes/types.js";
import type {
  ChangedEvent,
  CheckUpcomingVotesResult,
  ScoredBillChange,
} from "../monitoring/upcomingVotes.js";
import type { ActionPackageTarget, TriggerClass } from "./types.js";

/** Thresholds used by the classifier. Documented here, not scattered. */
export const NEARING_VOTE_RELEVANCE_MIN = 0.6;
export const NEARING_VOTE_CONFIDENCE_MIN = 0.4;
export const NEARING_VOTE_EVENT_HORIZON_DAYS = 14;
export const EVENT_SCHEDULED_HORIZON_DAYS = 7;
export const NEW_BILL_RELEVANCE_MIN = 0.7;
export const NEW_BILL_CONFIDENCE_MIN = 0.5;
export const MISALIGNMENT_COUNT_MIN = 3;
export const MISALIGNMENT_WINDOW_DAYS = 90;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type CandidatePackageKind = "outreach" | "reminder";

export type OutreachContext = {
  /** If present, the nearest related event that qualified the bill. */
  nearestEvent?: ChangedEvent;
  /** Issues already matched on this bill (feeds repeated_misalignment pairing). */
  matchedIssues: string[];
};

export type ReminderContext = {
  event: ChangedEvent;
};

export type ActionMomentCandidate = {
  triggerClass: TriggerClass;
  packageKind: CandidatePackageKind;
  outreachMode?: "letter" | "call";
  target: ActionPackageTarget;
  decisionHash: string;
  summary: string;
  /** Used for sorting / throttling — higher wins when we're over cap. */
  priority: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export type ClassifyOptions = {
  now?: number;
};

/**
 * Pure classifier: given the monitoring result (+ DB for historical
 * misalignment lookup), return the candidate set *before* guardrails.
 * The caller (propose.ts) applies mutes, throttles, feedback, and the
 * unique-hash dedup.
 */
export function classifyActionMoments(
  db: PolitiClawDb,
  result: CheckUpcomingVotesResult,
  opts: ClassifyOptions = {},
): ActionMomentCandidate[] {
  const now = opts.now ?? Date.now();
  const candidates: ActionMomentCandidate[] = [];

  const nearingBillIds = new Set<string>();
  for (const entry of result.changedBills) {
    const cand = classifyBillNearingVote(entry, result.changedEvents, now);
    if (cand) {
      candidates.push(cand);
      nearingBillIds.add(entry.bill.id);
    }
  }

  for (const entry of result.changedBills) {
    if (nearingBillIds.has(entry.bill.id)) continue;
    const cand = classifyNewBillHighRelevance(entry);
    if (cand) candidates.push(cand);
  }

  const eventSource = result.source.events;
  for (const entry of result.changedEvents) {
    const cand = classifyTrackedEventScheduled(entry, nearingBillIds, now, eventSource);
    if (cand) candidates.push(cand);
  }

  candidates.push(...classifyRepeatedMisalignment(db, now));

  return candidates;
}

function classifyBillNearingVote(
  entry: ScoredBillChange,
  events: readonly ChangedEvent[],
  now: number,
): ActionMomentCandidate | null {
  if (entry.change.reason === "unchanged" || entry.change.reason === "schema_bump") {
    return null;
  }
  const alignment = entry.alignment;
  if (!alignment) return null;
  if (alignment.belowConfidenceFloor) return null;
  if (alignment.relevance < NEARING_VOTE_RELEVANCE_MIN) return null;
  if (alignment.confidence < NEARING_VOTE_CONFIDENCE_MIN) return null;

  const nearestEvent = findNearestQualifyingEvent(entry.bill.id, events, now);
  if (!nearestEvent) return null;

  const issueMatch = alignment.matches[0];
  const issue = issueMatch?.issue ?? null;

  const relevanceBucket = Math.floor(alignment.relevance * 10) / 10;
  const decisionHash = hashDecisionInputs({
    triggerClass: "bill_nearing_vote",
    billId: entry.bill.id,
    nearestEventId: nearestEvent.event.id,
    nearestEventDate: nearestEvent.event.startDateTime ?? null,
    relevanceBucket,
  });

  const billLabel = `${entry.bill.billType} ${entry.bill.number}`;
  const when = nearestEvent.event.startDateTime ?? "soon";
  const summary = `${billLabel} has a scheduled ${nearestEvent.event.eventType.replace(
    "_",
    " ",
  )} on ${when}${issue ? ` — touches ${issue}` : ""}.`;

  return {
    triggerClass: "bill_nearing_vote",
    packageKind: "outreach",
    target: {
      billId: entry.bill.id,
      repId: null,
      issue,
      electionDate: null,
    },
    decisionHash,
    summary,
    priority: alignment.relevance,
    sourceAdapterId: entry.bill.sourceAdapterId,
    sourceTier: entry.bill.sourceTier,
  };
}

function classifyNewBillHighRelevance(
  entry: ScoredBillChange,
): ActionMomentCandidate | null {
  if (entry.change.reason !== "new") return null;
  const alignment = entry.alignment;
  if (!alignment) return null;
  if (alignment.belowConfidenceFloor) return null;
  if (alignment.relevance < NEW_BILL_RELEVANCE_MIN) return null;
  if (alignment.confidence < NEW_BILL_CONFIDENCE_MIN) return null;

  const issueMatch = alignment.matches[0];
  const issue = issueMatch?.issue ?? null;
  const relevanceBucket = Math.floor(alignment.relevance * 10) / 10;

  const decisionHash = hashDecisionInputs({
    triggerClass: "new_bill_high_relevance",
    billId: entry.bill.id,
    relevanceBucket,
  });

  const billLabel = `${entry.bill.billType} ${entry.bill.number}`;
  const summary = `${billLabel} is newly on the radar${
    issue ? ` and touches ${issue}` : ""
  }.`;

  return {
    triggerClass: "new_bill_high_relevance",
    packageKind: "outreach",
    target: {
      billId: entry.bill.id,
      repId: null,
      issue,
      electionDate: null,
    },
    decisionHash,
    summary,
    priority: alignment.relevance,
    sourceAdapterId: entry.bill.sourceAdapterId,
    sourceTier: entry.bill.sourceTier,
  };
}

function classifyTrackedEventScheduled(
  entry: ChangedEvent,
  nearingBillIds: Set<string>,
  now: number,
  source: CheckUpcomingVotesResult["source"]["events"],
): ActionMomentCandidate | null {
  if (entry.change.reason === "unchanged" || entry.change.reason === "schema_bump") {
    return null;
  }
  const when = entry.event.startDateTime;
  if (!when) return null;
  const daysOut = daysBetween(now, when);
  if (daysOut === null) return null;
  if (daysOut < 0 || daysOut > EVENT_SCHEDULED_HORIZON_DAYS) return null;

  // If any related bill already produced a bill_nearing_vote candidate, the
  // user gets the richer outreach offer; the reminder would be duplicative.
  if (entry.event.relatedBillIds.some((id) => nearingBillIds.has(id))) return null;

  const decisionHash = hashDecisionInputs({
    triggerClass: "tracked_event_scheduled",
    eventId: entry.event.id,
    startDateTime: when,
  });

  const summary = `${entry.event.title} scheduled for ${when}.`;

  return {
    triggerClass: "tracked_event_scheduled",
    packageKind: "reminder",
    target: {
      billId: entry.event.relatedBillIds[0] ?? null,
      repId: null,
      issue: null,
      electionDate: null,
    },
    decisionHash,
    summary,
    priority: 1 - daysOut / EVENT_SCHEDULED_HORIZON_DAYS,
    sourceAdapterId: source?.adapterId ?? "unknown",
    sourceTier: source?.tier ?? 0,
  };
}

type MisalignmentRow = {
  rep_id: string;
  rep_name: string;
  issue: string;
  misaligned_count: number;
  latest_vote_date: string | null;
  source_adapter_id: string;
  source_tier: number;
};

/**
 * Query `member_votes` + `bill_alignment` + `stance_signals` + `issue_stances`
 * for the user's current reps to find `(rep, issue)` pairs where the rep has
 * voted against the user's declared direction at least
 * {@link MISALIGNMENT_COUNT_MIN} times in the last
 * {@link MISALIGNMENT_WINDOW_DAYS} days.
 *
 * This shares the same joins as `scoreRepresentative`'s evidence read but
 * scoped to a time window and conflicted-only.
 *
 * Known limitation: Senate votes aren't in `member_votes` yet, so this
 * trigger is effectively House-only. Relaxing the count threshold would
 * produce false positives; we accept the silence.
 */
function classifyRepeatedMisalignment(
  db: PolitiClawDb,
  now: number,
): ActionMomentCandidate[] {
  const windowStart = new Date(now - MISALIGNMENT_WINDOW_DAYS * MS_PER_DAY)
    .toISOString()
    .slice(0, 10);

  const rows = db
    .prepare(
      `WITH latest_signals AS (
         SELECT bill_id, direction, weight, created_at,
                ROW_NUMBER() OVER (
                  PARTITION BY bill_id
                  ORDER BY created_at DESC, id DESC
                ) AS rn
           FROM stance_signals
          WHERE bill_id IS NOT NULL AND direction IN ('agree','disagree')
       ),
       ba_latest AS (
         SELECT ba.bill_id,
                ba.stance_snapshot_hash,
                ba.relevance,
                ba.matched_json,
                ba.source_adapter_id,
                ba.source_tier,
                ROW_NUMBER() OVER (
                  PARTITION BY ba.bill_id
                  ORDER BY ba.computed_at DESC
                ) AS rn
           FROM bill_alignment ba
       ),
       conflicted AS (
         SELECT reps.id          AS rep_id,
                reps.name        AS rep_name,
                iss.issue        AS issue,
                rcv.start_date   AS vote_date,
                ba.source_adapter_id AS source_adapter_id,
                ba.source_tier       AS source_tier,
                mv.position AS rep_position,
                ls.direction AS user_direction
           FROM reps
           JOIN member_votes mv    ON mv.bioguide_id = reps.id
           JOIN roll_call_votes rcv ON rcv.id = mv.vote_id
           JOIN ba_latest ba       ON ba.bill_id = rcv.bill_id AND ba.rn = 1
           JOIN latest_signals ls   ON ls.bill_id = ba.bill_id AND ls.rn = 1
           JOIN issue_stances iss   ON 1 = 1
          WHERE mv.position IN ('Yea','Nay')
            AND (rcv.is_procedural IS NULL OR rcv.is_procedural = 0)
            AND rcv.start_date >= @window_start
            AND iss.stance IN ('support','oppose')
            AND ba.matched_json LIKE '%"issue":"' || iss.issue || '"%'
            AND (
              (ls.direction = 'agree'    AND mv.position = 'Nay') OR
              (ls.direction = 'disagree' AND mv.position = 'Yea')
            )
       )
       SELECT rep_id, rep_name, issue,
              COUNT(*) AS misaligned_count,
              MAX(vote_date) AS latest_vote_date,
              MAX(source_adapter_id) AS source_adapter_id,
              MAX(source_tier) AS source_tier
         FROM conflicted
        GROUP BY rep_id, rep_name, issue
       HAVING COUNT(*) >= @threshold`,
    )
    .all({ window_start: windowStart, threshold: MISALIGNMENT_COUNT_MIN }) as
    | MisalignmentRow[]
    | undefined;

  if (!rows) return [];

  const candidates: ActionMomentCandidate[] = [];
  for (const row of rows) {
    const decisionHash = hashDecisionInputs({
      triggerClass: "repeated_misalignment",
      repId: row.rep_id,
      issue: row.issue,
      misalignedVoteCount: row.misaligned_count,
      latestVoteDate: row.latest_vote_date ?? null,
    });
    const summary = `${row.rep_name} has voted against your declared stance on ${row.issue} ${row.misaligned_count} times in the last ${MISALIGNMENT_WINDOW_DAYS} days.`;
    candidates.push({
      triggerClass: "repeated_misalignment",
      packageKind: "outreach",
      target: {
        billId: null,
        repId: row.rep_id,
        issue: row.issue,
        electionDate: null,
      },
      decisionHash,
      summary,
      priority: row.misaligned_count,
      sourceAdapterId: row.source_adapter_id,
      sourceTier: row.source_tier,
    });
  }
  return candidates;
}

function findNearestQualifyingEvent(
  billId: string,
  events: readonly ChangedEvent[],
  now: number,
): ChangedEvent | null {
  let best: { entry: ChangedEvent; days: number } | null = null;
  for (const entry of events) {
    if (!entry.event.relatedBillIds.includes(billId)) continue;
    if (!isQualifyingEventKind(entry.event)) continue;
    const when = entry.event.startDateTime;
    if (!when) continue;
    const days = daysBetween(now, when);
    if (days === null) continue;
    if (days < 0 || days > NEARING_VOTE_EVENT_HORIZON_DAYS) continue;
    if (!best || days < best.days) best = { entry, days };
  }
  return best?.entry ?? null;
}

function isQualifyingEventKind(event: UpcomingEvent): boolean {
  return event.eventType === "committee_meeting" || event.eventType === "markup";
}

function daysBetween(fromMs: number, toIso: string): number | null {
  const toMs = Date.parse(toIso);
  if (Number.isNaN(toMs)) return null;
  return (toMs - fromMs) / MS_PER_DAY;
}

export function hashDecisionInputs(inputs: Record<string, unknown>): string {
  const canonical: Record<string, unknown> = {};
  for (const key of Object.keys(inputs).sort()) {
    canonical[key] = inputs[key] ?? null;
  }
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 32);
}

/** Public helper for election_proximity candidates constructed outside this module. */
export function electionDaysBucket(daysToElection: number): 14 | 7 | 1 | null {
  if (daysToElection <= 0) return null;
  if (daysToElection <= 1) return 1;
  if (daysToElection <= 7) return 7;
  if (daysToElection <= 14) return 14;
  return null;
}
