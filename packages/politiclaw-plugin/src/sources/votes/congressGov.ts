import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import {
  isProceduralQuestion,
  normalizeVotePosition,
  rollCallIdOf,
  type MemberVote,
  type RollCallVote,
  type RollCallVoteListFilters,
  type RollCallVoteRef,
  type RollCallVoteWithMembers,
} from "./types.js";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const TIER: SourceTier = 1;
const ID = "congressGov.houseVotes";
const DEFAULT_LIST_LIMIT = 20;

type Fetcher = typeof fetch;

export type CongressGovHouseVotesAdapterOptions = {
  apiKey: string;
  fetcher?: Fetcher;
  now?: () => number;
  baseUrl?: string;
};

export interface RollCallVoteAdapter {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
  list(filters: RollCallVoteListFilters): Promise<AdapterResult<RollCallVote[]>>;
  getWithMembers(ref: RollCallVoteRef): Promise<AdapterResult<RollCallVoteWithMembers>>;
}

type CongressHouseVoteListItem = {
  congress?: number;
  sessionNumber?: number | string;
  rollCallNumber?: number | string;
  identifier?: number | string;
  startDate?: string;
  updateDate?: string;
  voteType?: string;
  result?: string;
  legislationType?: string;
  legislationNumber?: number | string;
  legislationUrl?: string;
  amendmentType?: string;
  amendmentNumber?: number | string;
  amendmentAuthor?: string;
  sourceDataURL?: string;
  url?: string;
};

type CongressHouseVoteListResponse = {
  houseRollCallVotes?: CongressHouseVoteListItem[];
  /** Some responses may wrap under a camelCase plural; we accept either. */
  houseVotes?: CongressHouseVoteListItem[];
  pagination?: { count?: number; next?: string | null };
  error?: { message?: string };
};

type CongressHouseVoteDetail = CongressHouseVoteListItem & {
  voteQuestion?: string;
};

type CongressHouseVoteDetailResponse = {
  houseRollCallVote?: CongressHouseVoteDetail;
  /** Defensive: some beta endpoints use alternate keys. */
  houseVote?: CongressHouseVoteDetail;
  error?: { message?: string };
};

type CongressHouseVoteMemberResult = {
  bioguideID?: string;
  firstName?: string;
  lastName?: string;
  voteCast?: string;
  voteParty?: string;
  voteState?: string;
};

type CongressHouseVoteMembersResponse = {
  houseRollCallVoteMemberVotes?: {
    results?: CongressHouseVoteMemberResult[];
    voteQuestion?: string;
  };
  /** Defensive: observed variant on older beta payloads. */
  houseRollCallVote?: {
    results?: CongressHouseVoteMemberResult[];
    voteQuestion?: string;
  };
  results?: CongressHouseVoteMemberResult[];
  error?: { message?: string };
};

/**
 * Primary-source (tier 1) adapter for api.congress.gov's `/house-vote` beta
 * endpoints. The list endpoint carries most fields we need, but `voteQuestion`
 * — required for procedural-vote classification — only appears at the
 * detail/members level. `getWithMembers()` fetches both the
 * `/{voteNumber}` detail (for `voteQuestion`) and the `/{voteNumber}/members`
 * sub-resource (for bioguide-keyed positions) in parallel so an empty response
 * from one does not mask a real response from the other.
 *
 * Amendment-only roll-call votes (`amendmentType: "HAMDT"`) are preserved but
 * carry no `billId` because api.congress.gov does not currently expose the
 * bill an amendment is offered against. If amendment coverage is added later,
 * it can join through a dedicated amendments table; until then, amendment
 * votes are visible but do not flow into per-bill rep alignment.
 *
 * Senate roll-call votes are deliberately not supported here — api.congress.gov
 * has no `/senate-vote` endpoint as of 2026-04-19. A future scraper-backed
 * adapter could fill that gap if Senate coverage is needed.
 */
export function createCongressGovHouseVotesAdapter(
  opts: CongressGovHouseVotesAdapterOptions,
): RollCallVoteAdapter {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;
  const baseUrl = opts.baseUrl ?? CONGRESS_API_BASE;

  return {
    id: ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      return opts.apiKey
        ? { status: "ok" }
        : { status: "unavailable", reason: "missing apiDataGov key" };
    },

    async list(
      filters: RollCallVoteListFilters,
    ): Promise<AdapterResult<RollCallVote[]>> {
      if (!opts.apiKey) {
        return unavailable(
          ID,
          "missing apiDataGov key",
          "set plugins.politiclaw.apiKeys.apiDataGov (https://api.data.gov/signup/)",
        );
      }

      const url = buildListUrl(baseUrl, filters, opts.apiKey);
      const response = await fetcher(url);
      if (!response.ok) {
        return unavailable(
          ID,
          `api.congress.gov http ${response.status}`,
          response.status === 429 || response.status === 403
            ? "check apiDataGov key validity + quota"
            : "retry shortly",
        );
      }

      const body = (await response.json()) as CongressHouseVoteListResponse;
      if (body.error?.message) {
        return unavailable(ID, `api.congress.gov error: ${body.error.message}`);
      }

      const raw = body.houseRollCallVotes ?? body.houseVotes ?? [];
      const normalized = raw
        .map(normalizeListItem)
        .filter((v): v is RollCallVote => v !== null);

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: normalized,
        fetchedAt: now(),
      };
    },

    async getWithMembers(
      ref: RollCallVoteRef,
    ): Promise<AdapterResult<RollCallVoteWithMembers>> {
      if (ref.chamber !== "House") {
        return unavailable(
          ID,
          `${ID} only serves House roll-call votes (got chamber=${ref.chamber})`,
          "Senate roll-call votes require the unitedstates/congress scraper fallback (not yet implemented)",
        );
      }
      if (!opts.apiKey) {
        return unavailable(
          ID,
          "missing apiDataGov key",
          "set plugins.politiclaw.apiKeys.apiDataGov (https://api.data.gov/signup/)",
        );
      }

      const detailUrl = buildDetailUrl(baseUrl, ref, opts.apiKey);
      const membersUrl = buildMembersUrl(baseUrl, ref, opts.apiKey);

      const [detailResult, membersResult] = await Promise.all([
        fetchJson<CongressHouseVoteDetailResponse>(fetcher, detailUrl),
        fetchJson<CongressHouseVoteMembersResponse>(fetcher, membersUrl),
      ]);

      if (detailResult.kind === "error") {
        return unavailable(ID, `api.congress.gov http ${detailResult.status}`);
      }
      if (detailResult.body.error?.message) {
        return unavailable(
          ID,
          `api.congress.gov error: ${detailResult.body.error.message}`,
        );
      }

      const detailRaw =
        detailResult.body.houseRollCallVote ?? detailResult.body.houseVote;
      if (!detailRaw) {
        return unavailable(ID, "api.congress.gov returned no detail payload");
      }

      const vote = normalizeDetailItem(detailRaw, ref);
      if (!vote) {
        return unavailable(ID, "api.congress.gov detail payload is unparseable");
      }

      const members: MemberVote[] =
        membersResult.kind === "ok"
          ? normalizeMembers(membersResult.body, vote.id)
          : [];

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

function buildListUrl(
  baseUrl: string,
  filters: RollCallVoteListFilters,
  apiKey: string,
): URL {
  const path =
    filters.session !== undefined
      ? `${baseUrl}/house-vote/${filters.congress}/${filters.session}`
      : `${baseUrl}/house-vote/${filters.congress}`;

  const url = new URL(path);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(filters.limit ?? DEFAULT_LIST_LIMIT));
  if (filters.offset !== undefined) {
    url.searchParams.set("offset", String(filters.offset));
  }
  return url;
}

function buildDetailUrl(baseUrl: string, ref: RollCallVoteRef, apiKey: string): URL {
  const url = new URL(
    `${baseUrl}/house-vote/${ref.congress}/${ref.session}/${ref.rollCallNumber}`,
  );
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url;
}

function buildMembersUrl(baseUrl: string, ref: RollCallVoteRef, apiKey: string): URL {
  const url = new URL(
    `${baseUrl}/house-vote/${ref.congress}/${ref.session}/${ref.rollCallNumber}/members`,
  );
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url;
}

function normalizeListItem(raw: CongressHouseVoteListItem): RollCallVote | null {
  const congress = coerceInt(raw.congress);
  const session = coerceInt(raw.sessionNumber);
  const rollCallNumber = coerceInt(raw.rollCallNumber);
  if (congress === null || session === null || rollCallNumber === null) return null;

  const id = rollCallIdOf({
    chamber: "House",
    congress,
    session,
    rollCallNumber,
  });

  return {
    id,
    chamber: "House",
    congress,
    session,
    rollCallNumber,
    startDate: raw.startDate,
    updateDate: raw.updateDate,
    voteType: raw.voteType,
    result: raw.result,
    billId: billIdFromLegislation(congress, raw.legislationType, raw.legislationNumber),
    amendmentId: amendmentIdFromLegislation(
      congress,
      raw.amendmentType ?? raw.legislationType,
      raw.amendmentNumber ?? raw.legislationNumber,
    ),
    amendmentAuthor: raw.amendmentAuthor,
    legislationUrl: raw.legislationUrl,
    sourceUrl: raw.url ? stripApiKey(raw.url) : undefined,
    // list payloads omit voteQuestion; isProcedural left undefined until detail hydrates
  };
}

function normalizeDetailItem(
  raw: CongressHouseVoteDetail,
  ref: RollCallVoteRef,
): RollCallVote | null {
  const base = normalizeListItem(raw);
  if (!base) {
    // Detail payloads occasionally omit echoed list-level fields; fall back to the
    // caller's ref when the server forgot to include congress/session/rollCall.
    const id = rollCallIdOf(ref);
    const fallback: RollCallVote = {
      id,
      chamber: "House",
      congress: ref.congress,
      session: ref.session,
      rollCallNumber: ref.rollCallNumber,
      voteQuestion: raw.voteQuestion,
      isProcedural: isProceduralQuestion(raw.voteQuestion),
    };
    return fallback;
  }
  return {
    ...base,
    voteQuestion: raw.voteQuestion,
    isProcedural: isProceduralQuestion(raw.voteQuestion),
  };
}

function normalizeMembers(
  body: CongressHouseVoteMembersResponse,
  voteId: string,
): MemberVote[] {
  const results =
    body.houseRollCallVoteMemberVotes?.results ??
    body.houseRollCallVote?.results ??
    body.results ??
    [];
  const out: MemberVote[] = [];
  for (const entry of results) {
    const bioguide = entry.bioguideID?.trim();
    const position = normalizeVotePosition(entry.voteCast);
    if (!bioguide || !position) continue;
    out.push({
      voteId,
      bioguideId: bioguide,
      position,
      firstName: entry.firstName?.trim() || undefined,
      lastName: entry.lastName?.trim() || undefined,
      party: entry.voteParty?.trim() || undefined,
      state: entry.voteState?.trim() || undefined,
    });
  }
  return out;
}

const BILL_TYPE_SET = new Set([
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
]);

function billIdFromLegislation(
  congress: number,
  legislationType: string | undefined,
  legislationNumber: string | number | undefined,
): string | undefined {
  if (!legislationType || legislationNumber === undefined) return undefined;
  const type = legislationType.trim().toUpperCase();
  if (!BILL_TYPE_SET.has(type)) return undefined;
  const num = String(legislationNumber).trim();
  if (!num) return undefined;
  return `${congress}-${type.toLowerCase()}-${num}`;
}

function amendmentIdFromLegislation(
  congress: number,
  amendmentType: string | undefined,
  amendmentNumber: string | number | undefined,
): string | undefined {
  if (!amendmentType || amendmentNumber === undefined) return undefined;
  if (amendmentType.trim().toUpperCase() !== "HAMDT") return undefined;
  const num = String(amendmentNumber).trim();
  if (!num) return undefined;
  return `${congress}-hamdt-${num}`;
}

function coerceInt(raw: number | string | undefined): number | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? Math.trunc(raw) : null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function stripApiKey(raw: string): string {
  try {
    const url = new URL(raw);
    url.searchParams.delete("api_key");
    return url.toString();
  } catch {
    return raw;
  }
}

type FetchOk<T> = { kind: "ok"; body: T };
type FetchErr = { kind: "error"; status: number };

async function fetchJson<T>(
  fetcher: Fetcher,
  url: URL,
): Promise<FetchOk<T> | FetchErr> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch {
    return { kind: "error", status: 0 };
  }
  if (!response.ok) return { kind: "error", status: response.status };
  try {
    const body = (await response.json()) as T;
    return { kind: "ok", body };
  } catch {
    return { kind: "error", status: response.status };
  }
}
