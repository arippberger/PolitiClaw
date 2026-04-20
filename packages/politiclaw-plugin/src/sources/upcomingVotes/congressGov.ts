import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type { UpcomingEvent, UpcomingEventsFilters } from "./types.js";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";
const TIER: SourceTier = 1;
const ID = "congressGov.committeeMeetings";
const DEFAULT_LIST_LIMIT = 25;

type Fetcher = typeof fetch;

export type CongressGovUpcomingAdapterOptions = {
  apiKey: string;
  fetcher?: Fetcher;
  now?: () => number;
  baseUrl?: string;
};

export interface UpcomingVotesAdapter {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
  list(filters: UpcomingEventsFilters): Promise<AdapterResult<UpcomingEvent[]>>;
}

type CongressCommitteeMeetingListEntry = {
  eventId?: string | number;
  congress?: number;
  chamber?: string;
  type?: string;
  url?: string;
};

type CongressCommitteeMeetingListResponse = {
  committeeMeetings?: CongressCommitteeMeetingListEntry[];
  error?: { message?: string };
};

type CongressRelatedBill = {
  congress?: number;
  type?: string;
  number?: string | number;
};

type CongressCommitteeMeetingDetail = {
  eventId?: string | number;
  congress?: number;
  chamber?: string;
  type?: string;
  title?: string;
  date?: string;
  location?: { room?: string; building?: string; address?: string };
  committees?: { item?: { name?: string; systemCode?: string }[] };
  relatedBills?: { item?: CongressRelatedBill[] };
};

type CongressCommitteeMeetingDetailResponse = {
  committeeMeeting?: CongressCommitteeMeetingDetail;
  error?: { message?: string };
};

/**
 * Primary-source (tier 1) adapter for api.congress.gov's `/committee-meeting`
 * endpoint. The list response carries only stub entries (eventId, chamber,
 * type, detail URL); everything useful — title, date, related bills — lives
 * on the detail sub-resource. We hydrate every listed meeting in parallel
 * and return the normalized {@link UpcomingEvent} shape.
 *
 * Failed detail fetches are skipped rather than collapsing the whole list.
 * Matches api.congress.gov's pattern of intermittent 500s on individual
 * meeting records.
 */
export function createCongressGovUpcomingAdapter(
  opts: CongressGovUpcomingAdapterOptions,
): UpcomingVotesAdapter {
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
      filters: UpcomingEventsFilters,
    ): Promise<AdapterResult<UpcomingEvent[]>> {
      if (!opts.apiKey) {
        return unavailable(
          ID,
          "missing apiDataGov key",
          "set plugins.politiclaw.apiKeys.apiDataGov (https://api.data.gov/signup/)",
        );
      }

      const listUrl = buildListUrl(baseUrl, filters, opts.apiKey);
      const listResponse = await fetcher(listUrl);
      if (!listResponse.ok) {
        return unavailable(
          ID,
          `api.congress.gov http ${listResponse.status}`,
          listResponse.status === 429 || listResponse.status === 403
            ? "check apiDataGov key validity + quota"
            : "retry shortly",
        );
      }

      const listBody =
        (await listResponse.json()) as CongressCommitteeMeetingListResponse;
      if (listBody.error?.message) {
        return unavailable(ID, `api.congress.gov error: ${listBody.error.message}`);
      }

      const stubs = listBody.committeeMeetings ?? [];
      const detailUrls = stubs
        .map((stub) => normalizeDetailUrl(stub, baseUrl, opts.apiKey))
        .filter((url): url is string => Boolean(url));

      const events = await Promise.all(
        detailUrls.map((url) => fetchDetail(fetcher, url)),
      );
      const normalized = events
        .filter((event): event is UpcomingEvent => event !== null)
        .filter((event) => matchesFilters(event, filters))
        .sort(byStartDateAsc)
        .slice(0, filters.limit ?? DEFAULT_LIST_LIMIT);

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: normalized,
        fetchedAt: now(),
      };
    },
  };
}

function buildListUrl(
  baseUrl: string,
  filters: UpcomingEventsFilters,
  apiKey: string,
): URL {
  const path = filters.congress
    ? `${baseUrl}/committee-meeting/${filters.congress}`
    : `${baseUrl}/committee-meeting`;
  const url = new URL(path);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(filters.limit ?? DEFAULT_LIST_LIMIT));
  if (filters.offset !== undefined) {
    url.searchParams.set("offset", String(filters.offset));
  }
  if (filters.fromDateTime) url.searchParams.set("fromDateTime", filters.fromDateTime);
  if (filters.toDateTime) url.searchParams.set("toDateTime", filters.toDateTime);
  return url;
}

function normalizeDetailUrl(
  stub: CongressCommitteeMeetingListEntry,
  baseUrl: string,
  apiKey: string,
): string | null {
  if (stub.url) {
    try {
      const parsed = new URL(stub.url);
      parsed.searchParams.set("api_key", apiKey);
      parsed.searchParams.set("format", "json");
      return parsed.toString();
    } catch {
      return null;
    }
  }
  const congress = stub.congress;
  const chamber = stub.chamber?.toLowerCase();
  const eventId = stub.eventId !== undefined ? String(stub.eventId) : undefined;
  if (!congress || !chamber || !eventId) return null;
  const url = new URL(`${baseUrl}/committee-meeting/${congress}/${chamber}/${eventId}`);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url.toString();
}

async function fetchDetail(
  fetcher: Fetcher,
  url: string,
): Promise<UpcomingEvent | null> {
  let response: Response;
  try {
    response = await fetcher(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  let body: CongressCommitteeMeetingDetailResponse;
  try {
    body = (await response.json()) as CongressCommitteeMeetingDetailResponse;
  } catch {
    return null;
  }
  if (body.error?.message) return null;
  return normalizeDetail(body.committeeMeeting, url);
}

function normalizeDetail(
  raw: CongressCommitteeMeetingDetail | undefined,
  detailUrl: string,
): UpcomingEvent | null {
  if (!raw) return null;
  const congress = raw.congress;
  const eventId = raw.eventId !== undefined ? String(raw.eventId) : undefined;
  const chamber = normalizeChamber(raw.chamber);
  if (!congress || !eventId || !chamber) return null;

  const eventType = normalizeEventType(raw.type);
  const id = `${congress}-${chamber.toLowerCase()}-${eventType}-${eventId}`;

  return {
    id,
    congress,
    chamber,
    eventType,
    title: raw.title?.trim() ?? "(untitled meeting)",
    startDateTime: raw.date,
    location: formatLocation(raw.location),
    committeeName: raw.committees?.item?.[0]?.name?.trim(),
    relatedBillIds: extractRelatedBillIds(raw.relatedBills?.item ?? []),
    sourceUrl: stripApiKey(detailUrl),
  };
}

function normalizeChamber(raw: string | undefined): UpcomingEvent["chamber"] | null {
  switch (raw?.toLowerCase()) {
    case "house":
      return "House";
    case "senate":
      return "Senate";
    case "joint":
    case "nochamber":
    case "":
    case undefined:
      return raw?.toLowerCase() === "joint" ? "Joint" : null;
    default:
      return null;
  }
}

function normalizeEventType(raw: string | undefined): UpcomingEvent["eventType"] {
  switch (raw?.toLowerCase()) {
    case "hearing":
      return "hearing";
    case "markup":
      return "markup";
    default:
      return "committee_meeting";
  }
}

function formatLocation(
  location: CongressCommitteeMeetingDetail["location"],
): string | undefined {
  if (!location) return undefined;
  const parts = [location.room, location.building, location.address].filter(
    (p): p is string => Boolean(p),
  );
  return parts.length > 0 ? parts.join(", ") : undefined;
}

function extractRelatedBillIds(
  items: readonly CongressRelatedBill[],
): string[] {
  const ids: string[] = [];
  for (const item of items) {
    const congress = item.congress;
    const type = item.type?.toLowerCase();
    const number = item.number !== undefined ? String(item.number) : undefined;
    if (!congress || !type || !number) continue;
    ids.push(`${congress}-${type}-${number}`);
  }
  return ids;
}

function matchesFilters(
  event: UpcomingEvent,
  filters: UpcomingEventsFilters,
): boolean {
  if (filters.chamber && event.chamber !== filters.chamber) return false;
  if (filters.fromDateTime && event.startDateTime) {
    if (event.startDateTime < filters.fromDateTime) return false;
  }
  if (filters.toDateTime && event.startDateTime) {
    if (event.startDateTime > filters.toDateTime) return false;
  }
  return true;
}

function byStartDateAsc(a: UpcomingEvent, b: UpcomingEvent): number {
  const aTime = a.startDateTime ?? "";
  const bTime = b.startDateTime ?? "";
  return aTime.localeCompare(bTime);
}

function stripApiKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("api_key");
    return parsed.toString();
  } catch {
    return url;
  }
}
