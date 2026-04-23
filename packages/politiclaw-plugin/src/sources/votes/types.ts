import { SENATE_PROCEDURAL_VOTE_QUESTIONS } from "./senateProcedural.js";

/**
 * Adapter-agnostic shape for a recorded congressional roll-call vote.
 *
 * Normalized across api.congress.gov `/house-vote` (House) and voteview.com's
 * `/api/download` (Senate). Both adapters populate the same `RollCallVote`
 * shape so downstream scoring never has to branch on chamber.
 */
export type VoteChamber = "House" | "Senate";

/**
 * Member vote positions, normalized to House clerk terminology.
 *
 * api.congress.gov's raw `voteCast` field can return "Aye" (rule-of-the-House
 * terminology) or "Yea" (yea-and-nay terminology); both mean "yes" and we
 * collapse to "Yea" so downstream scoring sees a single canonical value.
 */
export type MemberVotePosition = "Yea" | "Nay" | "Present" | "Not Voting";

/**
 * House-specific procedural-question list. Matched against api.congress.gov's
 * `voteQuestion` phrasing. Procedural votes are excluded from representative
 * alignment unless the user explicitly opts in; keeping the flag on the
 * adapter-agnostic shape means scoring never has to re-parse `voteQuestion`.
 *
 * Senate procedural questions live in `./senateProcedural.ts` because the
 * Senate clerk phrases motions differently ("On the Cloture Motion", "On the
 * Motion to Proceed", etc.). The chamber-aware {@link isProceduralQuestion}
 * below picks the right list per vote.
 */
export const PROCEDURAL_VOTE_QUESTIONS: readonly string[] = [
  "On Motion to Recommit",
  "On Motion to Reconsider",
  "On Motion to Table",
  "On Ordering the Previous Question",
];

export type RollCallVote = {
  /** Canonical PolitiClaw id: `<chamber>-<congress>-<session>-<rollCall>`, lowercase chamber. */
  id: string;
  chamber: VoteChamber;
  congress: number;
  /** 1 or 2. */
  session: number;
  rollCallNumber: number;
  /** ISO-8601 timestamp the vote was taken. */
  startDate?: string;
  /** ISO-8601 last-update timestamp in Congress.gov. */
  updateDate?: string;
  /** Raw `voteType` from the source (e.g., "Yea-and-Nay", "Recorded Vote"). */
  voteType?: string;
  /** Raw `result` from the source (e.g., "Passed", "Failed", "Agreed to"). */
  result?: string;
  /**
   * The question put to the chamber (e.g., "On Passage", "On Motion to Recommit").
   * Populated only at the detail/members level; list responses omit it.
   */
  voteQuestion?: string;
  /**
   * Canonical PolitiClaw bill id (`<congress>-<type>-<number>`, lowercase) when
   * the vote is on a bill. Absent for amendment-only votes and standalone
   * procedural votes with no underlying legislation.
   */
  billId?: string;
  /** Canonical amendment reference `<congress>-hamdt-<number>` for amendment votes. */
  amendmentId?: string;
  /** Text name of the amendment sponsor when the vote is on an amendment. */
  amendmentAuthor?: string;
  /** congress.gov URL to the underlying legislation (not the API detail URL). */
  legislationUrl?: string;
  /** api.congress.gov detail URL (api_key stripped). */
  sourceUrl?: string;
  /**
   * Derived from {@link voteQuestion}. `undefined` when the list-level payload
   * has not yet had detail hydrated — callers should treat `undefined` as "do
   * not use for procedural-exclusion filtering" until detail lands.
   */
  isProcedural?: boolean;
};

export type MemberVote = {
  /** `RollCallVote.id` foreign key. */
  voteId: string;
  /** bioguide id — joins to `reps.id` for federal members. */
  bioguideId: string;
  position: MemberVotePosition;
  firstName?: string;
  lastName?: string;
  /** 1-letter party code (R / D / I). */
  party?: string;
  /** 2-letter state code. */
  state?: string;
};

export type RollCallVoteWithMembers = {
  vote: RollCallVote;
  members: MemberVote[];
};

export type RollCallVoteListFilters = {
  congress: number;
  /**
   * Which chamber to enumerate. Routes to the correct adapter in the votes
   * resolver (House → api.congress.gov, Senate → voteview).
   */
  chamber: VoteChamber;
  /** 1 or 2. If omitted, caller gets whatever session the API default returns. */
  session?: number;
  limit?: number;
  offset?: number;
};

export type RollCallVoteRef = {
  chamber: VoteChamber;
  congress: number;
  session: number;
  rollCallNumber: number;
};

export function rollCallIdOf(ref: RollCallVoteRef): string {
  return `${ref.chamber.toLowerCase()}-${ref.congress}-${ref.session}-${ref.rollCallNumber}`;
}

/**
 * Parses api.congress.gov's `voteCast` string into the canonical position.
 * Returns `null` for values we don't recognize so callers can skip without
 * inventing a position.
 */
export function normalizeVotePosition(raw: string | undefined): MemberVotePosition | null {
  if (!raw) return null;
  const value = raw.trim();
  switch (value) {
    case "Aye":
    case "Yea":
    case "aye":
    case "yea":
      return "Yea";
    case "Nay":
    case "No":
    case "nay":
    case "no":
      return "Nay";
    case "Present":
    case "present":
      return "Present";
    case "Not Voting":
    case "not voting":
      return "Not Voting";
    default:
      return null;
  }
}

/**
 * Procedural-question classification. Returns `false` for unknown questions:
 * procedural exclusion is a narrow enumerated list, not a catch-all;
 * substantive vote questions (e.g., "On Passage", "On Agreeing to the
 * Amendment") do not match.
 *
 * When `chamber` is omitted (list-level House records that have not been
 * hydrated yet), the House list is used — this preserves the pre-Senate-adapter
 * behavior. Senate votes always pass `chamber: "Senate"` so cloture motions
 * and motion-to-proceed questions route to the Senate list.
 */
export function isProceduralQuestion(
  voteQuestion: string | undefined,
  chamber?: VoteChamber,
): boolean {
  if (!voteQuestion) return false;
  const needle = voteQuestion.trim().toLowerCase();
  const list =
    chamber === "Senate"
      ? SENATE_PROCEDURAL_VOTE_QUESTIONS
      : PROCEDURAL_VOTE_QUESTIONS;
  return list.some((q) => q.toLowerCase() === needle);
}
