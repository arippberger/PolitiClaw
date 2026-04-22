import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import {
  checkUpcomingVotes,
  type CheckUpcomingVotesResult,
  type ChangedEvent,
  type ScoredBillChange,
} from "../domain/monitoring/upcomingVotes.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import { createBillsResolver } from "../sources/bills/index.js";
import { createUpcomingVotesResolver } from "../sources/upcomingVotes/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DEFAULT_CONGRESS = 119;

const CheckUpcomingVotesParams = Type.Object({
  congress: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Congress number. Defaults to the 119th (2025-2027).",
    }),
  ),
  billType: Type.Optional(
    Type.String({ description: "Restrict bill check to HR, S, HJRES, etc." }),
  ),
  fromDateTime: Type.Optional(
    Type.String({
      description:
        "ISO-8601 lower bound passed to both bills (updateDate) and events (startDateTime).",
    }),
  ),
  toDateTime: Type.Optional(Type.String({ description: "ISO-8601 upper bound." })),
  chamber: Type.Optional(
    Type.Union([
      Type.Literal("House"),
      Type.Literal("Senate"),
      Type.Literal("Joint"),
    ]),
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 50, description: "Max bills to examine (1-50)." }),
  ),
  refresh: Type.Optional(
    Type.Boolean({
      description:
        "When true, bypass the 6h bills-list cache and re-fetch from api.congress.gov.",
    }),
  ),
});

const CheckUpcomingVotesInputSchema = z.object({
  congress: z.number().int().positive().optional(),
  billType: z.string().trim().min(1).optional(),
  fromDateTime: z.string().trim().min(1).optional(),
  toDateTime: z.string().trim().min(1).optional(),
  chamber: z.enum(["House", "Senate", "Joint"]).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  refresh: z.boolean().optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

/**
 * Render a check-upcoming-votes result as user-facing text. Enforces two
 * output rules:
 *   - any scored output includes ALIGNMENT_DISCLAIMER verbatim (the
 *     scored-bills section is position-adjacent reasoning)
 *   - the empty-delta case is a feature, not a failure; we say so explicitly
 *     rather than emitting silence that looks like a bug
 */
export function renderCheckUpcomingVotesOutput(
  result: CheckUpcomingVotesResult,
): string {
  if (result.status === "unavailable") {
    const billReason = formatReason("bills", result.reasons.bills);
    const eventReason = formatReason("upcoming events", result.reasons.events);
    return [
      "Check failed: no source available.",
      billReason,
      eventReason,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const sections: string[] = [];
  sections.push(renderProvenance(result));

  if (result.changedBills.length === 0 && result.changedEvents.length === 0) {
    sections.push(
      `No new or materially changed items since last check (checked ${result.unchangedBillCount} bills, ${result.unchangedEventCount} upcoming events).`,
    );
    if (result.mutedBillCount > 0 || result.mutedEventCount > 0) {
      sections.push(renderMutedNote(result));
    }
    if (result.status === "partial") {
      if (result.reasons.bills) sections.push(formatReason("bills", result.reasons.bills));
      if (result.reasons.events) {
        sections.push(formatReason("upcoming events", result.reasons.events));
      }
    }
    return sections.join("\n");
  }

  if (result.changedBills.length > 0) {
    sections.push("Bills — new or materially changed:");
    for (const entry of result.changedBills) sections.push(renderBill(entry));
  }

  if (result.changedEvents.length > 0) {
    sections.push("");
    sections.push("Upcoming committee events — new or materially changed:");
    for (const entry of result.changedEvents) sections.push(renderEvent(entry));
  }

  sections.push("");
  sections.push(
    `(${result.unchangedBillCount} bills unchanged, ${result.unchangedEventCount} events unchanged.)`,
  );

  if (result.mutedBillCount > 0 || result.mutedEventCount > 0) {
    sections.push(renderMutedNote(result));
  }

  if (result.status === "partial") {
    if (result.reasons.bills) sections.push(formatReason("bills", result.reasons.bills));
    if (result.reasons.events) {
      sections.push(formatReason("upcoming events", result.reasons.events));
    }
  }

  const hasScored = result.changedBills.some((entry) => entry.alignment);
  if (hasScored) {
    sections.push("");
    sections.push(ALIGNMENT_DISCLAIMER);
  }

  return sections.join("\n");
}

function renderMutedNote(result: CheckUpcomingVotesResult): string {
  const parts: string[] = [];
  if (result.mutedBillCount > 0) {
    parts.push(`${result.mutedBillCount} bill${result.mutedBillCount === 1 ? "" : "s"}`);
  }
  if (result.mutedEventCount > 0) {
    parts.push(
      `${result.mutedEventCount} event${result.mutedEventCount === 1 ? "" : "s"} (all related bills muted)`,
    );
  }
  return `(${parts.join(", ")} suppressed by mute list — use politiclaw_list_mutes to review.)`;
}

function renderProvenance(result: CheckUpcomingVotesResult): string {
  const parts: string[] = [];
  if (result.source.bills) {
    parts.push(
      `bills via ${result.source.bills.adapterId} (tier ${result.source.bills.tier})`,
    );
  }
  if (result.source.events) {
    parts.push(
      `events via ${result.source.events.adapterId} (tier ${result.source.events.tier})`,
    );
  }
  return parts.length > 0 ? `Sources: ${parts.join("; ")}.` : "Sources: none available.";
}

function renderBill(entry: ScoredBillChange): string {
  const bill = entry.bill;
  const header = `- [${entry.change.reason}] ${bill.congress} ${bill.billType} ${bill.number}: ${bill.title}`;
  const action = bill.latestActionText
    ? `    ${bill.latestActionDate ?? ""} ${bill.latestActionText}`.trimEnd()
    : "";
  const alignment = renderAlignmentLine(entry);
  return [header, action, alignment].filter(Boolean).join("\n");
}

function renderAlignmentLine(entry: ScoredBillChange): string {
  if (!entry.alignment) return "";
  if (entry.alignment.belowConfidenceFloor) {
    return "    Alignment: insufficient data (confidence below floor).";
  }
  const rel = Math.round(entry.alignment.relevance * 100);
  const conf = Math.round(entry.alignment.confidence * 100);
  const matches =
    entry.alignment.matches.length === 0
      ? "no declared-stance matches"
      : entry.alignment.matches
          .map((m) => `${m.issue} (${m.stance}, weight ${m.stanceWeight})`)
          .join(", ");
  return `    Alignment: ${rel}% relevance, ${conf}% confidence — ${matches}.`;
}

function renderEvent(entry: ChangedEvent): string {
  const event = entry.event;
  const when = event.startDateTime ?? "(no date on record)";
  const header = `- [${entry.change.reason}] ${when} — ${event.title}`;
  const committee = event.committeeName ? `    Committee: ${event.committeeName}` : "";
  const location = event.location ? `    Location: ${event.location}` : "";
  const related =
    event.relatedBillIds.length > 0
      ? `    Related bills: ${event.relatedBillIds.join(", ")}`
      : "";
  return [header, committee, location, related].filter(Boolean).join("\n");
}

function formatReason(
  label: string,
  reason: { reason: string; actionable?: string } | undefined,
): string {
  if (!reason) return "";
  const hint = reason.actionable ? ` (${reason.actionable})` : "";
  return `${label}: ${reason.reason}.${hint}`;
}

export const checkUpcomingVotesTool: AnyAgentTool = {
  name: "politiclaw_check_upcoming_votes",
  label: "Check upcoming votes + bill changes since last run",
  description:
    "Run the change-detection loop: fetch recent federal bills + upcoming committee " +
    "events from api.congress.gov (tier 1), compare each against the persisted " +
    "snapshot, and return only items that are new or have materially changed since " +
    "the last check. Bill changes are scored against declared issue stances when " +
    "any are set. A second invocation on unchanged data returns an empty delta. " +
    "Requires plugins.politiclaw.apiKeys.apiDataGov.",
  parameters: CheckUpcomingVotesParams,
  async execute(_toolCallId, rawParams) {
    const parsed = CheckUpcomingVotesInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }
    const input = parsed.data;
    const congress = input.congress ?? DEFAULT_CONGRESS;

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const billsResolver = createBillsResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
      scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
    });
    const upcomingVotesResolver = createUpcomingVotesResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
    });

    const result = await checkUpcomingVotes(db, billsResolver, upcomingVotesResolver, {
      billFilters: {
        congress,
        billType: input.billType,
        fromDateTime: input.fromDateTime,
        toDateTime: input.toDateTime,
        limit: input.limit,
      },
      eventFilters: {
        congress,
        fromDateTime: input.fromDateTime,
        toDateTime: input.toDateTime,
        chamber: input.chamber,
        limit: input.limit,
      },
      refreshBills: input.refresh,
    });

    return textResult(renderCheckUpcomingVotesOutput(result), result);
  },
};

export const monitoringTools: AnyAgentTool[] = [checkUpcomingVotesTool];
