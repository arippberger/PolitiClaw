import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { UpcomingVotesResolver } from "../../sources/upcomingVotes/index.js";
import type {
  UpcomingEvent,
  UpcomingEventsFilters,
} from "../../sources/upcomingVotes/types.js";
import type { BillListFilters } from "../../sources/bills/types.js";
import { searchBills, type StoredBill } from "../bills/index.js";
import { computeBillAlignment, type AlignmentResult } from "../scoring/alignment.js";
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
 */
export type ScoredBillChange = {
  bill: StoredBill;
  change: ChangeDetectionResult;
  alignment: AlignmentResult | null;
};

export type ChangedEvent = {
  event: UpcomingEvent;
  change: ChangeDetectionResult;
};

export type CheckUpcomingVotesResult = {
  status: "ok" | "partial" | "unavailable";
  changedBills: ScoredBillChange[];
  unchangedBillCount: number;
  changedEvents: ChangedEvent[];
  unchangedEventCount: number;
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

  const result: CheckUpcomingVotesResult = {
    status: "ok",
    changedBills: [],
    unchangedBillCount: 0,
    changedEvents: [],
    unchangedEventCount: 0,
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
        result.changedBills.push({ bill, change, alignment });
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
      const change = detectChange(db, {
        kind: "committee_meeting",
        id: event.id,
        hashInput: eventHashInput(event),
        source: { adapterId: eventsResult.adapterId, tier: eventsResult.tier },
      });
      if (change.changed) {
        result.changedEvents.push({ event, change });
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

  const billsOk = billsResult.status === "ok";
  const eventsOk = eventsResult.status === "ok";
  if (!billsOk && !eventsOk) result.status = "unavailable";
  else if (!billsOk || !eventsOk) result.status = "partial";

  return result;
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
