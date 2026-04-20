/**
 * Adapter-agnostic shape for a scheduled congressional event that may
 * produce a recorded vote — a committee meeting or a floor action.
 *
 * Deliberately narrow: we normalize only the fields that are stable
 * across api.congress.gov payloads and useful for change detection +
 * user-facing rendering. `relatedBillIds` is the pivot point for bill
 * alignment scoring on upcoming events.
 */
export type UpcomingEvent = {
  /** Canonical PolitiClaw id: `<congress>-<chamber>-<eventType>-<eventId>`. */
  id: string;
  congress: number;
  chamber: "House" | "Senate" | "Joint";
  eventType: "committee_meeting" | "hearing" | "markup";
  title: string;
  /** ISO-8601 start date-time. */
  startDateTime?: string;
  location?: string;
  committeeName?: string;
  /** Canonical bill ids (`<congress>-<type>-<number>`), lowercase. */
  relatedBillIds: string[];
  sourceUrl?: string;
};

export type UpcomingEventsFilters = {
  congress?: number;
  /** ISO-8601 lower bound on startDateTime. */
  fromDateTime?: string;
  toDateTime?: string;
  chamber?: "House" | "Senate" | "Joint";
  limit?: number;
  offset?: number;
};
