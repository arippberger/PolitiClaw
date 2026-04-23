import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import { parseVoteviewBillNumber } from "./billNumberParser.js";
import { congressGovPublicBillUrl } from "../bills/types.js";
import type { RollCallVoteAdapter } from "./congressGov.js";
import {
  isProceduralQuestion,
  normalizeVotePosition,
  rollCallIdOf,
  type MemberVote,
  type RollCallVote,
  type RollCallVoteListFilters,
  type RollCallVoteRef,
  type RollCallVoteWithMembers,
  type VoteChamber,
} from "./types.js";
import {
  createVoteviewClient,
  type VoteviewClientOptions,
  type VoteviewMemberVote,
  type VoteviewRollcallDetail,
  type VoteviewSearchRollcall,
} from "./voteviewClient.js";

const ID = "voteview.senateVotes";
const TIER: SourceTier = 2;
const DEFAULT_LIST_LIMIT = 20;

export type VoteviewSenateVotesAdapterOptions = VoteviewClientOptions & {
  now?: () => number;
};

/**
 * Tier-2 adapter serving Senate roll-call votes from voteview.com.
 *
 * api.congress.gov does not expose a `/senate-vote` endpoint as of
 * 2026-04-19, so Senate alignment scoring would otherwise have no data to
 * join against. Voteview's web-app API returns the same per-member,
 * bioguide-keyed positions api.congress.gov provides for the House, which
 * lets `ingestVotes` and the scoring SQL handle both chambers uniformly.
 *
 * Session derivation: Voteview reports only `date` and `rollnumber`; roll
 * numbers are continuous within a Congress. We derive `session` from the
 * calendar year of the vote (`2 * congress + 1787` is the start year; e.g.,
 * the 119th Congress starts 2025 → session 1, 2026 → session 2) so the
 * storage schema's `(chamber, congress, session, roll_call_number)`
 * uniqueness constraint is preserved without schema changes.
 *
 * Bill linkage: `bill_number` strings (`"S5"`, `"H.R. 1234"`) are parsed by
 * `parseVoteviewBillNumber`. Presidential-nomination ids (`"PN1113"`) are
 * rejected, so confirmation votes drop out of bill-keyed scoring — which
 * matches the MVP scope. Senate amendments are not linked in this adapter;
 * amendment votes carry `billId = undefined` and are excluded from scoring.
 */
export function createVoteviewSenateVotesAdapter(
  opts: VoteviewSenateVotesAdapterOptions = {},
): RollCallVoteAdapter {
  const client = createVoteviewClient(opts);
  const now = opts.now ?? Date.now;

  return {
    id: ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      return { status: "ok" };
    },

    async list(
      filters: RollCallVoteListFilters,
    ): Promise<AdapterResult<RollCallVote[]>> {
      if (filters.chamber !== "Senate") {
        return unavailable(
          ID,
          `${ID} only serves Senate roll-call votes (got chamber=${filters.chamber})`,
          "House votes come from congressGov.houseVotes",
        );
      }

      const query = `congress:${filters.congress} chamber:Senate`;
      const searchResult = await client.searchRollcalls(query);
      if (searchResult.kind !== "ok") {
        return unavailable(
          ID,
          searchResult.reason,
          searchResult.status === 429 || searchResult.status >= 500
            ? "voteview rate limit or outage — retry shortly"
            : undefined,
        );
      }

      const normalized: RollCallVote[] = [];
      for (const raw of searchResult.body.rollcalls) {
        if (raw.chamber !== "Senate") continue;
        const vote = normalizeSearchItem(raw);
        if (!vote) continue;
        if (filters.session !== undefined && vote.session !== filters.session) {
          continue;
        }
        normalized.push(vote);
      }

      normalized.sort(compareByRecency);

      const offset = filters.offset ?? 0;
      const limit = filters.limit ?? DEFAULT_LIST_LIMIT;
      const sliced = normalized.slice(offset, offset + limit);

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: sliced,
        fetchedAt: now(),
      };
    },

    async getWithMembers(
      ref: RollCallVoteRef,
    ): Promise<AdapterResult<RollCallVoteWithMembers>> {
      if (ref.chamber !== "Senate") {
        return unavailable(
          ID,
          `${ID} only serves Senate roll-call votes (got chamber=${ref.chamber})`,
          "House votes come from congressGov.houseVotes",
        );
      }

      const rollcallId = voteviewRollcallId(ref);
      const detailResult = await client.getRollcall(rollcallId);
      if (detailResult.kind !== "ok") {
        return unavailable(ID, detailResult.reason);
      }

      const vote = normalizeDetailItem(detailResult.body, ref);
      if (!vote) {
        return unavailable(ID, "voteview detail payload is unparseable");
      }

      const members = normalizeMembers(detailResult.body.votes ?? [], vote.id);

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: { vote, members },
        fetchedAt: now(),
      };
    },
  };
}

function normalizeSearchItem(raw: VoteviewSearchRollcall): RollCallVote | null {
  const session = sessionFromDate(raw.congress, raw.date);
  if (!session) return null;
  const billId = parseVoteviewBillNumber(raw.congress, raw.bill_number);
  const chamber: VoteChamber = "Senate";
  const id = rollCallIdOf({
    chamber,
    congress: raw.congress,
    session,
    rollCallNumber: raw.rollnumber,
  });
  return {
    id,
    chamber,
    congress: raw.congress,
    session,
    rollCallNumber: raw.rollnumber,
    startDate: raw.date,
    // Voteview's public API does not expose a freshness timestamp; leave
    // `updateDate` undefined so the ingest skip-check treats equal-undefined
    // pairs as "unchanged" and re-run cost stays bounded to the list fetch.
    updateDate: undefined,
    voteType: undefined,
    result: raw.vote_result,
    voteQuestion: raw.question,
    billId,
    amendmentId: undefined,
    amendmentAuthor: undefined,
    legislationUrl: billId ? congressGovPublicBillUrl(billId) ?? undefined : undefined,
    sourceUrl: `https://voteview.com/rollcall/${raw.id}`,
    isProcedural: raw.question
      ? isProceduralQuestion(raw.question, chamber)
      : undefined,
  };
}

function normalizeDetailItem(
  raw: VoteviewRollcallDetail,
  ref: RollCallVoteRef,
): RollCallVote | null {
  const base = normalizeSearchItem(raw);
  if (base) return base;
  // Defensive fallback if the detail payload is missing date/congress fields.
  const id = rollCallIdOf(ref);
  return {
    id,
    chamber: ref.chamber,
    congress: ref.congress,
    session: ref.session,
    rollCallNumber: ref.rollCallNumber,
    voteQuestion: raw.question,
    billId: parseVoteviewBillNumber(ref.congress, raw.bill_number),
    sourceUrl: `https://voteview.com/rollcall/${raw.id ?? voteviewRollcallId(ref)}`,
    isProcedural: raw.question
      ? isProceduralQuestion(raw.question, "Senate")
      : undefined,
  };
}

function normalizeMembers(
  votes: VoteviewMemberVote[],
  voteId: string,
): MemberVote[] {
  const out: MemberVote[] = [];
  for (const v of votes) {
    const bioguide = v.bioguide_id?.trim();
    if (!bioguide) continue;
    const position = normalizeVotePosition(v.cast_str ?? v.vote);
    if (!position) continue;
    out.push({
      voteId,
      bioguideId: bioguide,
      position,
      firstName: v.first_name?.trim() || undefined,
      lastName: v.last_name?.trim() || undefined,
      party: partyCodeToLetter(v.party_code),
      state: v.state_abbrev?.trim() || v.state?.trim() || undefined,
    });
  }
  return out;
}

function partyCodeToLetter(code: number | undefined): string | undefined {
  switch (code) {
    case 100:
      return "D";
    case 200:
      return "R";
    case 328:
      return "I";
    default:
      return undefined;
  }
}

/**
 * Maps a calendar-year date to the session of the given Congress. A Congress
 * starts in year `2 * congress + 1787`: the 119th opens 2025 → session 1;
 * 2026 → session 2. Returns `null` for dates outside the two-year span.
 */
export function sessionFromDate(
  congress: number,
  dateIso: string,
): 1 | 2 | null {
  const year = Number.parseInt(dateIso.slice(0, 4), 10);
  if (!Number.isFinite(year)) return null;
  const startYear = 2 * congress + 1787;
  const offset = year - startYear;
  if (offset === 0) return 1;
  if (offset === 1) return 2;
  return null;
}

function voteviewRollcallId(ref: RollCallVoteRef): string {
  const prefix = ref.chamber === "Senate" ? "RS" : "RH";
  const roll = String(ref.rollCallNumber).padStart(4, "0");
  return `${prefix}${ref.congress}${roll}`;
}

function compareByRecency(a: RollCallVote, b: RollCallVote): number {
  const da = a.startDate ?? "";
  const db = b.startDate ?? "";
  if (da !== db) return -da.localeCompare(db);
  return b.rollCallNumber - a.rollCallNumber;
}
