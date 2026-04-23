import type { PolitiClawDb } from "../../storage/sqlite.js";
import { listMutedRefs } from "../mutes/index.js";
import { getPreferences } from "../preferences/index.js";
import {
  listNotNowTuples,
  listStopTuples,
  type NotNowTuple,
  type StopTuple,
} from "./feedback.js";
import {
  createActionPackage,
  listActionPackagesCreatedSince,
  listOpenActionPackagesForRep,
} from "./packages.js";
import {
  classifyActionMoments,
  type ActionMomentCandidate,
  type ClassifyOptions,
} from "./triggers.js";
import type { ActionPackageRow, TriggerClass } from "./types.js";

import type { CheckUpcomingVotesResult } from "../monitoring/upcomingVotes.js";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const NOT_NOW_COOLDOWN_DAYS = 7;
export const PER_REP_OPEN_LIMIT = 3;
export const GLOBAL_DAILY_LIMIT = 5;
export const NEW_BILL_PER_RUN_LIMIT = 2;

export type ProposeOptions = ClassifyOptions;

/**
 * Apply guardrails to classifier candidates and persist survivors.
 * Returns the persisted rows so callers can render offers inline.
 *
 * Guardrails run cheapest-first; any rule that suppresses a candidate
 * short-circuits the chain for that row. The rule list mirrors the plan
 * and the order is observable in tests.
 */
export function proposeActionMoments(
  db: PolitiClawDb,
  monitoringResult: CheckUpcomingVotesResult,
  opts: ProposeOptions = {},
): ActionPackageRow[] {
  const prefs = getPreferences(db);
  if (prefs && actionPromptingOff(prefs)) return [];

  const candidates = classifyActionMoments(db, monitoringResult, opts);
  if (candidates.length === 0) return [];

  const now = opts.now ?? Date.now();
  const mutedBills = listMutedRefs(db, "bill");
  const mutedReps = listMutedRefs(db, "rep");
  const mutedIssues = listMutedRefs(db, "issue");
  const stopTuples = listStopTuples(db);
  const notNowTuples = listNotNowTuples(db);

  const afterMutes = candidates.filter(
    (c) => !isMuted(c, mutedBills, mutedReps, mutedIssues),
  );
  const afterStop = afterMutes.filter((c) => !isStoppedTuple(c, stopTuples));
  const afterNotNow = afterStop.filter((c) => !isInNotNowCooldown(c, notNowTuples, now));

  const afterPerTopicCap = applyPerTopicCap(afterNotNow);
  const afterPerRepThrottle = applyPerRepThrottle(db, afterPerTopicCap);
  const afterGlobalThrottle = applyGlobalThrottle(db, afterPerRepThrottle, now);

  const persisted: ActionPackageRow[] = [];
  for (const cand of afterGlobalThrottle) {
    const row = createActionPackage(db, {
      triggerClass: cand.triggerClass,
      packageKind: cand.packageKind,
      outreachMode: cand.outreachMode ?? null,
      billId: cand.target.billId,
      repId: cand.target.repId,
      issue: cand.target.issue,
      electionDate: cand.target.electionDate,
      decisionHash: cand.decisionHash,
      summary: cand.summary,
      sourceAdapterId: cand.sourceAdapterId,
      sourceTier: cand.sourceTier,
      now,
    });
    persisted.push(row);
  }
  return persisted;
}

function actionPromptingOff(prefs: unknown): boolean {
  const value = (prefs as { actionPrompting?: string })?.actionPrompting;
  return value === "off";
}

function isMuted(
  cand: ActionMomentCandidate,
  bills: Set<string>,
  reps: Set<string>,
  issues: Set<string>,
): boolean {
  if (cand.target.billId && bills.has(cand.target.billId)) return true;
  if (cand.target.repId && reps.has(cand.target.repId)) return true;
  if (cand.target.issue && issues.has(cand.target.issue)) return true;
  return false;
}

function isStoppedTuple(
  cand: ActionMomentCandidate,
  stops: readonly StopTuple[],
): boolean {
  return stops.some(
    (s) =>
      s.triggerClass === cand.triggerClass &&
      s.billId === cand.target.billId &&
      s.repId === cand.target.repId &&
      s.issue === cand.target.issue &&
      s.electionDate === cand.target.electionDate,
  );
}

function isInNotNowCooldown(
  cand: ActionMomentCandidate,
  notNows: readonly NotNowTuple[],
  now: number,
): boolean {
  const cutoff = now - NOT_NOW_COOLDOWN_DAYS * MS_PER_DAY;
  return notNows.some(
    (n) =>
      n.triggerClass === cand.triggerClass &&
      n.billId === cand.target.billId &&
      n.repId === cand.target.repId &&
      n.issue === cand.target.issue &&
      n.electionDate === cand.target.electionDate &&
      n.mostRecentAt >= cutoff,
  );
}

/**
 * Rule 5 — per-topic frequency cap.
 *
 * bill_nearing_vote / repeated_misalignment: ≤ 1 per (trigger_class, rep_id, issue).
 * tracked_event_scheduled: ≤ 1 per event_id (encoded in billId fallback → decisionHash).
 * new_bill_high_relevance: ≤ {@link NEW_BILL_PER_RUN_LIMIT} per run, highest-priority wins.
 */
function applyPerTopicCap(
  candidates: readonly ActionMomentCandidate[],
): ActionMomentCandidate[] {
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  const seenTopics = new Set<string>();
  const out: ActionMomentCandidate[] = [];
  let newBillCount = 0;
  for (const cand of sorted) {
    if (cand.triggerClass === "new_bill_high_relevance") {
      if (newBillCount >= NEW_BILL_PER_RUN_LIMIT) continue;
      newBillCount += 1;
      out.push(cand);
      continue;
    }
    const key = topicKey(cand);
    if (seenTopics.has(key)) continue;
    seenTopics.add(key);
    out.push(cand);
  }
  return out;
}

function topicKey(cand: ActionMomentCandidate): string {
  return [
    cand.triggerClass,
    cand.target.billId ?? "",
    cand.target.repId ?? "",
    cand.target.issue ?? "",
    cand.target.electionDate ?? "",
  ].join("|");
}

function applyPerRepThrottle(
  db: PolitiClawDb,
  candidates: readonly ActionMomentCandidate[],
): ActionMomentCandidate[] {
  const alreadyOpenByRep = new Map<string, number>();
  const out: ActionMomentCandidate[] = [];
  // Sort high priority first so lowest-alignment drops when we overflow.
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  for (const cand of sorted) {
    const repId = cand.target.repId;
    if (!repId) {
      out.push(cand);
      continue;
    }
    let count = alreadyOpenByRep.get(repId);
    if (count === undefined) {
      count = listOpenActionPackagesForRep(db, repId).length;
      alreadyOpenByRep.set(repId, count);
    }
    if (count >= PER_REP_OPEN_LIMIT) continue;
    alreadyOpenByRep.set(repId, count + 1);
    out.push(cand);
  }
  return out;
}

function applyGlobalThrottle(
  db: PolitiClawDb,
  candidates: readonly ActionMomentCandidate[],
  now: number,
): ActionMomentCandidate[] {
  const since = now - MS_PER_DAY;
  const recentCount = listActionPackagesCreatedSince(db, since).length;
  const remaining = Math.max(0, GLOBAL_DAILY_LIMIT - recentCount);
  if (remaining <= 0) return [];
  const sorted = [...candidates].sort((a, b) => b.priority - a.priority);
  return sorted.slice(0, remaining);
}

export type { TriggerClass };
