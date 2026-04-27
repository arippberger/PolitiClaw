import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";

import type { ActionPackageRow } from "../domain/actionMoments/index.js";
import {
  checkUpcomingVotes,
  type CheckUpcomingVotesResult,
  type ChangedEvent,
  type ScoredBillChange,
  TIER1_MAX,
  TIER2_MAX,
} from "../domain/monitoring/upcomingVotes.js";
import { ALIGNMENT_DISCLAIMER } from "../domain/scoring/index.js";
import type { LlmClient } from "../domain/scoring/direction.js";
import type { DirectionForStance } from "../domain/scoring/direction.js";
import { createBillsResolver } from "../sources/bills/index.js";
import { createUpcomingVotesResolver } from "../sources/upcomingVotes/index.js";
import { congressGovPublicBillUrl } from "../sources/bills/types.js";
import type { StanceMatch } from "../domain/scoring/alignment.js";
import { getPluginConfig, getStorage } from "../storage/context.js";
import { safeParse } from "../validation/typebox.js";

const DEFAULT_CONGRESS = 119;

/**
 * Test seam: production currently has no LLM transport wired for directional
 * framing in the monitoring loop, so by default `checkUpcomingVotes` runs
 * without direction classification. Tests inject a fake client to exercise
 * the Class-A directional output without coupling to a real LLM SDK.
 */
let directionLlmOverride: LlmClient | null = null;

export function setMonitoringDirectionLlmForTests(client: LlmClient | null): void {
  directionLlmOverride = client;
}

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


function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

/**
 * Render a check-upcoming-votes result as user-facing text. The agent uses
 * this baseline to compose its cron-delivered message.
 *
 * Output contract (see plan-5):
 *   - Empty delta: explicit one-liner. Silence looks like a bug.
 *   - Schema-bump-only delta: single labeled footer line.
 *   - Otherwise: bills and events grouped by triage tier (interruptive /
 *     digest / tail). Tier 1 is capped at {@link TIER1_MAX}; tier 2 at
 *     {@link TIER2_MAX}; overflow rolls into a terse tail count. Never
 *     silently truncates.
 *   - Every scored-bill section emits the `ALIGNMENT_DISCLAIMER` verbatim.
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

  const bills = groupBillsByTier(result.changedBills);
  const events = groupEventsByTier(result.changedEvents);
  const hasAnyItem =
    result.changedBills.length > 0 || result.changedEvents.length > 0;

  const sections: string[] = [];
  sections.push(renderProvenance(result));

  if (!hasAnyItem) {
    sections.push(renderEmptyDelta(result));
    if (result.mutedBillCount > 0 || result.mutedEventCount > 0) {
      sections.push(renderMutedNote(result));
    }
    if (result.status === "partial") sections.push(...renderPartialReasons(result));
    return sections.join("\n");
  }

  const hasRealChange =
    bills.tier1.length > 0 ||
    bills.tier2.length > 0 ||
    bills.tier3.length > 0 ||
    events.tier1.length > 0 ||
    events.tier2.length > 0;

  if (!hasRealChange && bills.schemaBump.length > 0) {
    sections.push(renderSchemaBumpOnly(bills.schemaBump.length));
    if (result.mutedBillCount > 0 || result.mutedEventCount > 0) {
      sections.push(renderMutedNote(result));
    }
    if (result.status === "partial") sections.push(...renderPartialReasons(result));
    return sections.join("\n");
  }

  if (bills.tier1.length > 0 || events.tier1.length > 0) {
    sections.push("");
    sections.push("Interruptive — high-relevance changes:");
    for (const entry of bills.tier1.slice(0, TIER1_MAX)) {
      sections.push(renderBillClassA(entry));
    }
    for (const entry of events.tier1) {
      sections.push(renderEventClassB(entry));
    }
  }

  const tier1BillOverflow = Math.max(0, bills.tier1.length - TIER1_MAX);
  const tier2Bills = bills.tier2.slice(0, TIER2_MAX);
  const tier2BillOverflow = Math.max(0, bills.tier2.length - TIER2_MAX);

  if (tier2Bills.length > 0 || events.tier2.length > 0) {
    sections.push("");
    sections.push("Digest — other tracked-issue movement:");
    for (const entry of tier2Bills) {
      sections.push(renderBillDigestLine(entry));
    }
    for (const entry of events.tier2) {
      sections.push(renderEventDigestLine(entry));
    }
  }

  const tailCount = bills.tier3.length + tier1BillOverflow + tier2BillOverflow;
  if (tailCount > 0) {
    sections.push("");
    sections.push(renderTailLine(bills.tier3, tier1BillOverflow + tier2BillOverflow));
  }

  if (bills.schemaBump.length > 0) {
    sections.push("");
    sections.push(
      `Baseline updated for ${bills.schemaBump.length} ${
        bills.schemaBump.length === 1 ? "bill" : "bills"
      } — no real change, will re-alert on the next material movement.`,
    );
  }

  sections.push("");
  sections.push(
    `(${result.unchangedBillCount} bills unchanged, ${result.unchangedEventCount} events unchanged.)`,
  );

  if (result.mutedBillCount > 0 || result.mutedEventCount > 0) {
    sections.push(renderMutedNote(result));
  }

  if (result.status === "partial") sections.push(...renderPartialReasons(result));

  if (result.actionPackages && result.actionPackages.length > 0) {
    sections.push("");
    sections.push(...renderActionPackages(result.actionPackages));
  }

  const hasScored =
    bills.tier1.length > 0 || bills.tier2.length > 0 || bills.tier3.length > 0;
  if (hasScored) {
    sections.push("");
    sections.push(ALIGNMENT_DISCLAIMER);
  }

  return sections.join("\n");
}

type BillGroups = {
  tier1: ScoredBillChange[];
  tier2: ScoredBillChange[];
  tier3: ScoredBillChange[];
  schemaBump: ScoredBillChange[];
};

type EventGroups = {
  tier1: ChangedEvent[];
  tier2: ChangedEvent[];
};

function groupBillsByTier(bills: readonly ScoredBillChange[]): BillGroups {
  const groups: BillGroups = { tier1: [], tier2: [], tier3: [], schemaBump: [] };
  for (const entry of bills) {
    if (entry.tier === "schema_bump") groups.schemaBump.push(entry);
    else if (entry.tier === "tier1") groups.tier1.push(entry);
    else if (entry.tier === "tier2") groups.tier2.push(entry);
    else groups.tier3.push(entry);
  }
  return groups;
}

function groupEventsByTier(events: readonly ChangedEvent[]): EventGroups {
  const groups: EventGroups = { tier1: [], tier2: [] };
  for (const entry of events) {
    if (entry.tier === "tier1") groups.tier1.push(entry);
    else groups.tier2.push(entry);
  }
  return groups;
}

function renderEmptyDelta(result: CheckUpcomingVotesResult): string {
  return `No new or materially changed items since last check (checked ${result.unchangedBillCount} bills, ${result.unchangedEventCount} upcoming events).`;
}

function renderSchemaBumpOnly(count: number): string {
  const noun = count === 1 ? "bill" : "bills";
  return `Baseline updated for ${count} ${noun} — no real change, will re-alert on the next material movement.`;
}

function renderPartialReasons(result: CheckUpcomingVotesResult): string[] {
  const lines: string[] = [];
  if (result.reasons.bills) lines.push(formatReason("bills", result.reasons.bills));
  if (result.reasons.events) {
    lines.push(formatReason("upcoming events", result.reasons.events));
  }
  return lines;
}

function renderActionPackages(packages: readonly ActionPackageRow[]): string[] {
  const lines: string[] = ["### You might want to act on"];
  for (const pkg of packages) {
    lines.push(`- ${pkg.summary} ${offerTail(pkg)}`);
  }
  lines.push(
    "",
    "These are offers — dismiss any with politiclaw_dismiss_action_package.",
  );
  return lines;
}

function offerTail(pkg: ActionPackageRow): string {
  if (pkg.packageKind === "outreach") {
    return "A draft letter or short call script is ready if you want one — call politiclaw_draft_letter or politiclaw_draft_call_script.";
  }
  if (pkg.packageKind === "reminder") {
    return "Create a reminder with politiclaw_create_reminder if you want a bookmark.";
  }
  return "Run politiclaw_prepare_me_for_my_next_election when you're ready.";
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

/**
 * Class A — interruptive bill change. Headline + why-it-matters (grounded in
 * stance match and bill-text quote when direction wired) + optional
 * counter-consideration + optional next-step. Capped at ~60 words of prose,
 * not counting the headline.
 */
function renderBillClassA(entry: ScoredBillChange): string {
  const lines: string[] = [];
  lines.push(`- **${billShortId(entry)} — ${entry.bill.title}** ${billVerb(entry)}.`);
  const why = buildWhyItMatters(entry);
  if (why) lines.push(`    Why it matters: ${why}`);
  const counter = buildCounterConsideration(entry);
  if (counter) lines.push(`    Counter-consideration: ${counter}`);
  const next = buildNextStep(entry);
  if (next) lines.push(`    Next: ${next}`);
  return lines.join("\n");
}

/**
 * Digest-row bill summary — single line, ≤ 25 words, no Next step (digest
 * body stays scannable). Still grounded in the stance match.
 */
function renderBillDigestLine(entry: ScoredBillChange): string {
  const match = topStanceMatch(entry.alignment?.matches);
  const touches = match
    ? ` · touches your \`${match.stance}\` on \`${match.issue}\``
    : "";
  return `- **${billShortId(entry)} — ${entry.bill.title}** ${billVerb(entry)}${touches}.`;
}

function renderTailLine(
  tier3: readonly ScoredBillChange[],
  overflowFromTiers: number,
): string {
  const topicSummary = summarizeTailTopics(tier3);
  const total = tier3.length + overflowFromTiers;
  const noun = total === 1 ? "bill" : "bills";
  if (topicSummary.length > 0) {
    return `Also changed: ${total} ${noun} — ${topicSummary}. Ask for the full list.`;
  }
  return `Also changed: ${total} ${noun} with no declared-stance match. Ask for the full list.`;
}

function summarizeTailTopics(tier3: readonly ScoredBillChange[]): string {
  const counts = new Map<string, number>();
  for (const entry of tier3) {
    for (const match of entry.alignment?.matches ?? []) {
      counts.set(match.issue, (counts.get(match.issue) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return "";
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([issue, count]) => `${count} touching \`${issue}\``);
  return parts.join(", ");
}

/**
 * Class B — upcoming committee event. Interruptive render when the event is
 * promoted to tier 1 (related bill is tier 1); otherwise the digest variant
 * below renders the one-liner.
 */
function renderEventClassB(entry: ChangedEvent): string {
  const event = entry.event;
  const when = formatEventDateTime(event.startDateTime);
  const location = event.location ? ` (${event.location})` : "";
  const headline = `- **${event.committeeName ?? "Committee"} — ${event.title}** · ${when}${location}.`;
  const lines: string[] = [headline];
  if (event.relatedBillIds.length > 0) {
    lines.push(`    Related bills: ${event.relatedBillIds.join(", ")}.`);
  }
  if (eventIsInFuture(event.startDateTime)) {
    lines.push(
      `    Next: politiclaw_draft_letter if you want to weigh in before the hearing.`,
    );
  }
  return lines.join("\n");
}

function renderEventDigestLine(entry: ChangedEvent): string {
  const event = entry.event;
  const when = formatEventDateTime(event.startDateTime);
  const related =
    event.relatedBillIds.length > 0
      ? ` · ${event.relatedBillIds.slice(0, 2).join(", ")}`
      : "";
  return `- **${event.committeeName ?? "Committee"} — ${event.title}** · ${when}${related}.`;
}

/**
 * Canonical short id for headlines — "HR-1234" reads better than
 * "119 HR 1234" in a prose lede. Congress context lives in provenance.
 */
function billShortId(entry: ScoredBillChange): string {
  return `${entry.bill.billType}-${entry.bill.number}`;
}

/**
 * Pick a verb that matches what actually happened — newly introduced vs.
 * advanced in committee vs. schema-bump baseline. For anything we can't
 * classify confidently we say "updated", which is accurate and not misleading.
 */
function billVerb(entry: ScoredBillChange): string {
  if (entry.change.reason === "new") return "newly introduced";
  if (entry.change.reason === "schema_bump") return "baseline updated";
  const text = entry.bill.latestActionText?.toLowerCase() ?? "";
  if (text.includes("became public law") || text.includes("signed by")) {
    return "signed into law";
  }
  if (text.includes("passed") || text.includes("agreed to")) return "passed";
  if (text.includes("referred to")) return "referred to committee";
  if (text.includes("reported")) return "reported out of committee";
  if (text.includes("placed on") && text.includes("calendar")) {
    return "placed on the calendar";
  }
  if (text.includes("vetoed")) return "vetoed";
  if (text.includes("failed")) return "failed";
  return "updated";
}

function buildWhyItMatters(entry: ScoredBillChange): string | null {
  const match = topStanceMatch(entry.alignment?.matches);
  if (!match) return null;
  const base = `touches your \`${match.stance}\` on \`${match.issue}\``;
  const directionQuote = topDirectionQuote(entry.direction, match.issue);
  if (directionQuote) {
    return `${base} — bill text: "${directionQuote}".`;
  }
  if (entry.direction && entry.direction.length > 0) {
    return `${base}. Direction unclear; no stance-grounded quote in available text.`;
  }
  return `${base} (via ${match.matchedText}).`;
}

function buildCounterConsideration(entry: ScoredBillChange): string | null {
  if (!entry.direction) return null;
  for (const item of entry.direction) {
    if (item.direction.kind === "advances" || item.direction.kind === "obstructs") {
      if (item.direction.counterConsideration) {
        return item.direction.counterConsideration;
      }
    }
  }
  return null;
}

/**
 * Build a Next-step line only when a realistic action exists. For bills with
 * a finality keyword in the latest action (Became Public Law, signed, failed,
 * vetoed) we omit the line — nudging the user to act after the fact would
 * be noise. Bills that are still moving get a draft-letter pointer plus the
 * primary-source link.
 */
function buildNextStep(entry: ScoredBillChange): string | null {
  const text = entry.bill.latestActionText?.toLowerCase() ?? "";
  const final =
    text.includes("became public law") ||
    text.includes("signed by the president") ||
    text.includes("vetoed") ||
    text.includes("failed of passage");
  if (final) return null;
  const link = congressGovPublicBillUrl(entry.bill.id);
  const draft = `politiclaw_draft_letter to weigh in`;
  if (link) return `${draft} · ${link}`;
  return draft;
}

function topStanceMatch(
  matches: readonly StanceMatch[] | undefined,
): StanceMatch | null {
  if (!matches || matches.length === 0) return null;
  return [...matches].sort((a, b) => b.stanceWeight - a.stanceWeight)[0] ?? null;
}

/**
 * Pick the directional quote that matches the surfaced stance. Prefers
 * `advances`/`obstructs` (fully grounded); falls back to the `mixed` quote
 * that exists when available. Returns null when direction is `unclear` or
 * the LLM wasn't wired.
 */
function topDirectionQuote(
  direction: readonly DirectionForStance[] | null,
  issue: string,
): string | null {
  if (!direction) return null;
  const match = direction.find((d) => d.issue === issue);
  if (!match) return null;
  const dir = match.direction;
  if (dir.kind === "advances" || dir.kind === "obstructs") {
    return dir.quotedText || null;
  }
  if (dir.kind === "mixed") {
    return dir.advancesQuote || dir.obstructsQuote || null;
  }
  return null;
}

/**
 * Render event date in a scannable "Fri Apr 24, 10:00 AM" shape. Falls back
 * to the raw ISO string if parsing fails (never throws; the raw value is still
 * auditable in the tool `details` payload).
 */
function formatEventDateTime(iso: string | undefined): string {
  if (!iso) return "(no date on record)";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function eventIsInFuture(iso: string | undefined): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() >= Date.now();
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
    "Surface federal bills and committee events that touch the user's declared " +
    "stances, so they can see how their reps' agenda lines up — or doesn't — " +
    "with the values they care about. Fetches recent federal bills and upcoming " +
    "committee events from api.congress.gov (tier 1), compares each against the " +
    "persisted snapshot, and returns only items that are new or have materially " +
    "changed since the last check. Bill changes are scored against declared " +
    "issue stances when any are set. Output is grouped by triage tier " +
    "(interruptive / digest / tail). A second invocation on unchanged data " +
    "returns an empty delta. Requires plugins.politiclaw.apiKeys.apiDataGov.",
  parameters: CheckUpcomingVotesParams,
  async execute(_toolCallId, rawParams) {
    const parsed = safeParse(CheckUpcomingVotesParams, rawParams);
    if (!parsed.ok) {
      return textResult(
        `Invalid input: ${parsed.messages.join("; ")}`,
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
      directionLlm: directionLlmOverride ?? undefined,
    });

    return textResult(renderCheckUpcomingVotesOutput(result), result);
  },
};

export const monitoringTools: AnyAgentTool[] = [checkUpcomingVotesTool];
