import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { UpcomingVotesResolver } from "../../sources/upcomingVotes/index.js";
import type {
  UpcomingEvent,
  UpcomingEventsFilters,
} from "../../sources/upcomingVotes/types.js";
import type { BillListFilters } from "../../sources/bills/types.js";
import {
  proposeActionMoments,
  sweepExpired,
  type ActionPackageRow,
} from "../actionMoments/index.js";
import { recordAlert } from "../alerts/index.js";
import { searchBills, type StoredBill } from "../bills/index.js";
import { listMutedRefs } from "../mutes/index.js";
import { computeBillAlignment, type AlignmentResult } from "../scoring/alignment.js";
import {
  computeBillDirection,
  type DirectionForStance,
  type LlmClient,
} from "../scoring/direction.js";
import { listIssueStances } from "../preferences/index.js";
import type { IssueStance } from "../preferences/types.js";
import { detectChange, type ChangeDetectionResult } from "./changeDetection.js";

/**
 * A bill that passed change detection (new or materially changed since the
 * last check) alongside its alignment score against the user's declared
 * stances, when any are declared.
 *
 * `change.reason = "schema_bump"` still surfaces here as a real alert:
 * bumping the hash schema means we've changed what we consider "material,"
 * and the honest failure mode is to let the user re-see these once rather
 * than silently suppress them.
 *
 * `direction` is populated when an LLM client is wired through
 * `checkUpcomingVotes` options and the bill's alignment crosses the
 * confidence floor. Without that, direction is null and the renderer falls
 * back to alignment-only framing.
 */
export type ScoredBillChange = {
  bill: StoredBill;
  change: ChangeDetectionResult;
  alignment: AlignmentResult | null;
  direction: DirectionForStance[] | null;
  tier: BillChangeTier;
};

export type ChangedEvent = {
  event: UpcomingEvent;
  change: ChangeDetectionResult;
  tier: EventChangeTier;
};

/**
 * Triage tier for a changed bill. Drives render grouping (interruptive vs
 * digest vs tail) and bundling caps. Schema bumps always route to their own
 * footer and never compete with real changes for tier slots.
 *
 * Thresholds align with the plan's bundling rules: tier 1 is interruptive
 * (max 3 items); tier 2 is digest body (max 5 items); tier 3 is tail.
 */
export type BillChangeTier = "tier1" | "tier2" | "tier3" | "schema_bump";

export type EventChangeTier = "tier1" | "tier2";

const TIER1_RELEVANCE = 0.6;
const TIER1_CONFIDENCE = 0.6;
const TIER2_RELEVANCE = 0.4;
const TIER2_CONFIDENCE = 0.4;

/** Max items surfaced per tier before the overflow rolls into the tail. */
export const TIER1_MAX = 3;
export const TIER2_MAX = 5;

export type CheckUpcomingVotesResult = {
  status: "ok" | "partial" | "unavailable";
  changedBills: ScoredBillChange[];
  unchangedBillCount: number;
  mutedBillCount: number;
  changedEvents: ChangedEvent[];
  unchangedEventCount: number;
  mutedEventCount: number;
  actionPackages: ActionPackageRow[];
  source: {
    bills?: { adapterId: string; tier: number };
    events?: { adapterId: string; tier: number };
  };
  reasons: {
    bills?: { reason: string; actionable?: string };
    events?: { reason: string; actionable?: string };
  };
};

export type CheckUpcomingVotesOptions = {
  billFilters?: BillListFilters;
  eventFilters?: UpcomingEventsFilters;
  /** When true, bypass the bills-list cache and force a refetch. */
  refreshBills?: boolean;
  /**
   * When provided, the engine asks the LLM to classify whether each changed
   * bill advances or obstructs the user's declared stances. Direction output
   * is only computed for bills whose alignment crosses the confidence floor;
   * schema-bump entries are never classified. Without this option, direction
   * is null and the renderer falls back to alignment-only framing.
   */
  directionLlm?: LlmClient;
};

/**
 * Compose bill fetch + bill alignment + change detection: fetch the recent
 * federal-bill slice and upcoming committee meetings, run each through the
 * change-detection primitive, and return *only* the subset that is new or
 * has materially changed since the last run. Score each changed bill against
 * the user's stances (no-op if none declared).
 *
 * This is the engine behind `politiclaw_check_upcoming_votes`. The tool
 * layer is a thin renderer.
 */
export async function checkUpcomingVotes(
  db: PolitiClawDb,
  billsResolver: BillsResolver,
  upcomingVotesResolver: UpcomingVotesResolver,
  options: CheckUpcomingVotesOptions = {},
): Promise<CheckUpcomingVotesResult> {
  const stances = listIssueStances(db).map<IssueStance>((row) => ({
    issue: row.issue,
    stance: row.stance,
    weight: row.weight,
  }));

  const mutedBillIds = listMutedRefs(db, "bill");

  const now = Date.now();
  sweepExpired(db, now);

  const result: CheckUpcomingVotesResult = {
    status: "ok",
    changedBills: [],
    unchangedBillCount: 0,
    mutedBillCount: 0,
    changedEvents: [],
    unchangedEventCount: 0,
    mutedEventCount: 0,
    actionPackages: [],
    source: {},
    reasons: {},
  };

  const billsResult = await searchBills(
    db,
    billsResolver,
    options.billFilters ?? {},
    { refresh: options.refreshBills },
  );

  if (billsResult.status === "ok") {
    result.source.bills = billsResult.source;
    for (const bill of billsResult.bills) {
      if (mutedBillIds.has(bill.id)) {
        result.mutedBillCount += 1;
        continue;
      }
      const change = detectChange(db, {
        kind: "bill",
        id: bill.id,
        hashInput: billHashInput(bill),
        source: {
          adapterId: bill.sourceAdapterId,
          tier: bill.sourceTier,
        },
      });
      if (change.changed) {
        const alignment =
          stances.length > 0 ? computeBillAlignment(bill, stances) : null;
        const tier = classifyBillTier(change, alignment);
        let direction: DirectionForStance[] | null = null;
        if (
          options.directionLlm &&
          change.reason !== "schema_bump" &&
          alignment &&
          !alignment.belowConfidenceFloor
        ) {
          direction = await computeBillDirection(bill, stances, options.directionLlm);
        }
        result.changedBills.push({ bill, change, alignment, direction, tier });
      } else {
        result.unchangedBillCount += 1;
      }
    }
  } else {
    result.reasons.bills = {
      reason: billsResult.reason,
      actionable: billsResult.actionable,
    };
  }

  const eventsResult = await upcomingVotesResolver.list(
    options.eventFilters ?? { congress: options.billFilters?.congress },
  );

  if (eventsResult.status === "ok") {
    result.source.events = {
      adapterId: eventsResult.adapterId,
      tier: eventsResult.tier,
    };
    for (const event of eventsResult.data) {
      // Drop an event when every related bill is muted — the event has no
      // bill context the user is still following. Events with no related
      // bills attached (schedule noise) are never filtered, since there's
      // nothing to match against.
      if (
        event.relatedBillIds.length > 0 &&
        event.relatedBillIds.every((billId) => mutedBillIds.has(billId))
      ) {
        result.mutedEventCount += 1;
        continue;
      }
      const change = detectChange(db, {
        kind: "committee_meeting",
        id: event.id,
        hashInput: eventHashInput(event),
        source: { adapterId: eventsResult.adapterId, tier: eventsResult.tier },
      });
      if (change.changed) {
        result.changedEvents.push({ event, change, tier: "tier2" });
      } else {
        result.unchangedEventCount += 1;
      }
    }
  } else {
    result.reasons.events = {
      reason: eventsResult.reason,
      actionable: eventsResult.actionable,
    };
  }

  result.changedBills.sort(byAlignmentThenAction);
  result.changedEvents.sort(byEventStart);

  promoteEventTiers(result);

  persistAlertHistory(db, result);

  result.actionPackages = proposeActionMoments(db, result, { now });

  const billsOk = billsResult.status === "ok";
  const eventsOk = eventsResult.status === "ok";
  if (!billsOk && !eventsOk) result.status = "unavailable";
  else if (!billsOk || !eventsOk) result.status = "partial";

  return result;
}

/**
 * Append an `alert_history` row for every change surfaced here, in the same
 * order the user sees them rendered. Runs after sort so persisted order
 * matches presented order for any later audit.
 */
function persistAlertHistory(
  db: PolitiClawDb,
  result: CheckUpcomingVotesResult,
): void {
  for (const entry of result.changedBills) {
    recordAlert(db, {
      kind: "bill_change",
      refId: entry.bill.id,
      changeReason: entry.change.reason,
      summary: billAlertSummary(entry.bill),
      sourceAdapterId: entry.bill.sourceAdapterId,
      sourceTier: entry.bill.sourceTier,
    });
  }
  for (const entry of result.changedEvents) {
    const source = result.source.events;
    recordAlert(db, {
      kind: "event_change",
      refId: entry.event.id,
      changeReason: entry.change.reason,
      summary: eventAlertSummary(entry.event),
      sourceAdapterId: source?.adapterId ?? "unknown",
      sourceTier: source?.tier ?? 0,
    });
  }
}

function billAlertSummary(bill: StoredBill): string {
  return `${bill.congress} ${bill.billType} ${bill.number}: ${bill.title}`;
}

function eventAlertSummary(event: UpcomingEvent): string {
  const when = event.startDateTime ?? "(no date)";
  return `${when} — ${event.title}`;
}

/**
 * The "material" fields for a bill — movement on these is what we alert
 * on. Title + sponsors + policy area are intentionally *excluded*: those
 * churn through amendments without representing a status transition, and
 * the user has already been alerted about the bill existing.
 */
export function billHashInput(bill: StoredBill): Record<string, unknown> {
  return {
    latestActionDate: bill.latestActionDate ?? null,
    latestActionText: bill.latestActionText ?? null,
    updateDate: bill.updateDate ?? null,
  };
}

/**
 * Event hash input. `relatedBillIds` is sorted so a non-deterministic API
 * ordering does not masquerade as a real change.
 */
export function eventHashInput(event: UpcomingEvent): Record<string, unknown> {
  return {
    title: event.title,
    startDateTime: event.startDateTime ?? null,
    location: event.location ?? null,
    committeeName: event.committeeName ?? null,
    relatedBillIds: [...event.relatedBillIds].sort(),
  };
}

function byAlignmentThenAction(a: ScoredBillChange, b: ScoredBillChange): number {
  const aRelevance = a.alignment?.relevance ?? -1;
  const bRelevance = b.alignment?.relevance ?? -1;
  if (aRelevance !== bRelevance) return bRelevance - aRelevance;
  const aAction = a.bill.latestActionDate ?? "";
  const bAction = b.bill.latestActionDate ?? "";
  return bAction.localeCompare(aAction);
}

function byEventStart(a: ChangedEvent, b: ChangedEvent): number {
  return (a.event.startDateTime ?? "").localeCompare(b.event.startDateTime ?? "");
}

/**
 * Classify a bill change into a triage tier. Schema bumps always route to
 * their own footer; real changes land in tier 1/2/3 based on alignment
 * strength. Bills with no alignment (no declared stances) default to tier 3.
 */
export function classifyBillTier(
  change: ChangeDetectionResult,
  alignment: AlignmentResult | null,
): BillChangeTier {
  if (change.reason === "schema_bump") return "schema_bump";
  if (!alignment) return "tier3";
  if (alignment.belowConfidenceFloor) return "tier3";
  if (
    alignment.relevance >= TIER1_RELEVANCE &&
    alignment.confidence >= TIER1_CONFIDENCE
  ) {
    return "tier1";
  }
  if (
    alignment.relevance >= TIER2_RELEVANCE &&
    alignment.confidence >= TIER2_CONFIDENCE
  ) {
    return "tier2";
  }
  return "tier3";
}

/**
 * Promote a committee event to tier 1 when any of its related bills already
 * sits in tier 1. Markups and hearings on high-relevance bills are themselves
 * high-relevance; treating them as tier 2 by default would bury them.
 */
function promoteEventTiers(result: CheckUpcomingVotesResult): void {
  const tier1BillIds = new Set(
    result.changedBills
      .filter((entry) => entry.tier === "tier1")
      .map((entry) => entry.bill.id),
  );
  if (tier1BillIds.size === 0) return;
  for (const entry of result.changedEvents) {
    if (entry.event.relatedBillIds.some((id) => tier1BillIds.has(id))) {
      entry.tier = "tier1";
    }
  }
}
