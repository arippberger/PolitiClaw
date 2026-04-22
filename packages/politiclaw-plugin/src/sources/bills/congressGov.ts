import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type {
  Bill,
  BillListFilters,
  BillRef,
  BillSponsor,
} from "./types.js";
import { billIdOf } from "./types.js";

const CONGRESS_API_BASE = "https://api.congress.gov/v3";

type Fetcher = (input: URL | string | Request, init?: RequestInit) => Promise<Response>;

export type CongressGovAdapterOptions = {
  apiKey: string;
  fetcher?: Fetcher;
  now?: () => number;
  /** Overrideable base URL, useful for tests. */
  baseUrl?: string;
};

export interface BillsAdapter {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
  list(filters: BillListFilters): Promise<AdapterResult<Bill[]>>;
  get(ref: BillRef): Promise<AdapterResult<Bill>>;
}

type CongressLatestAction = {
  actionDate?: string;
  text?: string;
};

type CongressListBill = {
  congress?: number;
  number?: string | number;
  type?: string;
  title?: string;
  originChamber?: string;
  latestAction?: CongressLatestAction;
  updateDate?: string;
  updateDateIncludingText?: string;
  url?: string;
};

type CongressBillListResponse = {
  bills?: CongressListBill[];
  pagination?: { count?: number; next?: string | null };
  error?: { message?: string };
};

type CongressSponsor = {
  bioguideId?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  party?: string;
  state?: string;
  district?: number | string;
};

type CongressDetailBill = CongressListBill & {
  introducedDate?: string;
  policyArea?: { name?: string };
  sponsors?: CongressSponsor[];
  subjects?: { url?: string } | CongressSubjectsInline;
  summaries?: { url?: string };
};

type CongressBillDetailResponse = {
  bill?: CongressDetailBill;
  error?: { message?: string };
};

type CongressSubject = { name?: string };

type CongressSubjectsInline = {
  legislativeSubjects?: CongressSubject[];
  policyArea?: { name?: string };
};

type CongressSubjectsResponse = {
  subjects?: CongressSubjectsInline;
  error?: { message?: string };
};

type CongressSummary = {
  text?: string;
  actionDate?: string;
  updateDate?: string;
};

type CongressSummariesResponse = {
  summaries?: CongressSummary[];
  error?: { message?: string };
};

const TIER: SourceTier = 1;
const ID = "congressGov";
const DEFAULT_LIST_LIMIT = 20;

export function createCongressGovAdapter(
  opts: CongressGovAdapterOptions,
): BillsAdapter {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;
  const baseUrl = opts.baseUrl ?? CONGRESS_API_BASE;

  return {
    id: ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      if (!opts.apiKey) {
        return { status: "unavailable", reason: "missing apiDataGov key" };
      }
      return { status: "ok" };
    },

    async list(filters: BillListFilters): Promise<AdapterResult<Bill[]>> {
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

      const body = (await response.json()) as CongressBillListResponse;
      if (body.error?.message) {
        return unavailable(ID, `api.congress.gov error: ${body.error.message}`);
      }

      const allBills = (body.bills ?? []).map(normalizeListBill).filter(isBill);
      const filtered = applyTitleFilter(allBills, filters.titleContains);

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: filtered,
        fetchedAt: now(),
      };
    },

    async get(ref: BillRef): Promise<AdapterResult<Bill>> {
      if (!opts.apiKey) {
        return unavailable(
          ID,
          "missing apiDataGov key",
          "set plugins.politiclaw.apiKeys.apiDataGov (https://api.data.gov/signup/)",
        );
      }

      const detailUrl = buildDetailUrl(baseUrl, ref, opts.apiKey);
      const detailResponse = await fetcher(detailUrl);
      if (!detailResponse.ok) {
        return unavailable(ID, `api.congress.gov http ${detailResponse.status}`);
      }

      const detailBody = (await detailResponse.json()) as CongressBillDetailResponse;
      if (detailBody.error?.message) {
        return unavailable(
          ID,
          `api.congress.gov error: ${detailBody.error.message}`,
        );
      }

      const baseBill = normalizeDetailBill(detailBody.bill);
      if (!baseBill) {
        return unavailable(ID, "api.congress.gov returned no bill payload");
      }

      // Subjects and summary live on sub-resources. Fetch them best-effort —
      // a failure here should not collapse the entire detail response.
      const subjects = await fetchSubjects(
        fetcher,
        detailBody.bill?.subjects,
        opts.apiKey,
      );
      const summaryText = await fetchFirstSummary(
        fetcher,
        detailBody.bill?.summaries,
        opts.apiKey,
      );

      const bill: Bill = {
        ...baseBill,
        subjects: subjects.length > 0 ? subjects : baseBill.subjects,
        summaryText: summaryText ?? baseBill.summaryText,
      };

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: bill,
        fetchedAt: now(),
      };
    },
  };
}

function buildListUrl(
  baseUrl: string,
  filters: BillListFilters,
  apiKey: string,
): URL {
  const path =
    filters.congress && filters.billType
      ? `${baseUrl}/bill/${filters.congress}/${filters.billType.toLowerCase()}`
      : filters.congress
        ? `${baseUrl}/bill/${filters.congress}`
        : `${baseUrl}/bill`;

  const url = new URL(path);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", String(filters.limit ?? DEFAULT_LIST_LIMIT));
  if (filters.offset !== undefined) {
    url.searchParams.set("offset", String(filters.offset));
  }
  if (filters.fromDateTime) url.searchParams.set("fromDateTime", filters.fromDateTime);
  if (filters.toDateTime) url.searchParams.set("toDateTime", filters.toDateTime);
  url.searchParams.set("sort", "updateDate+desc");
  return url;
}

function buildDetailUrl(baseUrl: string, ref: BillRef, apiKey: string): URL {
  const url = new URL(
    `${baseUrl}/bill/${ref.congress}/${ref.billType.toLowerCase()}/${ref.number}`,
  );
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("format", "json");
  return url;
}

function normalizeListBill(raw: CongressListBill): Bill | null {
  const congress = raw.congress;
  const number = raw.number !== undefined ? String(raw.number) : undefined;
  const billType = raw.type?.toUpperCase();
  if (!congress || !number || !billType) return null;

  return {
    id: billIdOf({ congress, billType, number }),
    congress,
    billType,
    number,
    title: raw.title?.trim() ?? "(untitled)",
    originChamber: normalizeChamber(raw.originChamber),
    latestActionDate: raw.latestAction?.actionDate,
    latestActionText: raw.latestAction?.text,
    updateDate: raw.updateDateIncludingText ?? raw.updateDate,
    sourceUrl: raw.url ? stripApiKey(raw.url) : undefined,
  };
}

function normalizeDetailBill(raw: CongressDetailBill | undefined): Bill | null {
  if (!raw) return null;
  const base = normalizeListBill(raw);
  if (!base) return null;

  const inlineSubjects = extractInlineSubjects(raw.subjects);

  return {
    ...base,
    introducedDate: raw.introducedDate ?? base.introducedDate,
    policyArea: raw.policyArea?.name ?? base.policyArea,
    sponsors: normalizeSponsors(raw.sponsors),
    subjects: inlineSubjects.length > 0 ? inlineSubjects : base.subjects,
  };
}

function extractInlineSubjects(
  subjects: CongressDetailBill["subjects"],
): string[] {
  if (!subjects) return [];
  const inline = (subjects as CongressSubjectsInline).legislativeSubjects;
  if (!inline) return [];
  return inline
    .map((entry) => entry.name?.trim())
    .filter((name): name is string => Boolean(name));
}

function normalizeSponsors(raw: CongressSponsor[] | undefined): BillSponsor[] | undefined {
  if (!raw || raw.length === 0) return undefined;
  const sponsors: BillSponsor[] = [];
  for (const entry of raw) {
    const fullName =
      entry.fullName?.trim() ??
      [entry.firstName ?? "", entry.lastName ?? ""].join(" ").trim();
    if (!fullName) continue;
    sponsors.push({
      bioguideId: entry.bioguideId,
      fullName,
      party: entry.party,
      state: entry.state,
      district: entry.district !== undefined ? String(entry.district) : undefined,
    });
  }
  return sponsors.length > 0 ? sponsors : undefined;
}

function normalizeChamber(raw: string | undefined): Bill["originChamber"] {
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "house") return "House";
  if (lower === "senate") return "Senate";
  return undefined;
}

function applyTitleFilter(bills: Bill[], query: string | undefined): Bill[] {
  if (!query) return bills;
  const needle = query.trim().toLowerCase();
  if (!needle) return bills;
  return bills.filter((bill) => bill.title.toLowerCase().includes(needle));
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

async function fetchSubjects(
  fetcher: Fetcher,
  subjects: CongressDetailBill["subjects"],
  apiKey: string,
): Promise<string[]> {
  const subResourceUrl = (subjects as { url?: string } | undefined)?.url;
  if (!subResourceUrl) return [];
  const url = withApiKey(subResourceUrl, apiKey);
  if (!url) return [];

  try {
    const response = await fetcher(url);
    if (!response.ok) return [];
    const body = (await response.json()) as CongressSubjectsResponse;
    return (body.subjects?.legislativeSubjects ?? [])
      .map((entry) => entry.name?.trim())
      .filter((name): name is string => Boolean(name));
  } catch {
    return [];
  }
}

async function fetchFirstSummary(
  fetcher: Fetcher,
  summaries: CongressDetailBill["summaries"],
  apiKey: string,
): Promise<string | undefined> {
  if (!summaries?.url) return undefined;
  const url = withApiKey(summaries.url, apiKey);
  if (!url) return undefined;

  try {
    const response = await fetcher(url);
    if (!response.ok) return undefined;
    const body = (await response.json()) as CongressSummariesResponse;
    const first = body.summaries?.[0];
    return first?.text?.trim() || undefined;
  } catch {
    return undefined;
  }
}

function withApiKey(raw: string, apiKey: string): URL | null {
  try {
    const url = new URL(raw);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("format", "json");
    return url;
  } catch {
    return null;
  }
}

function isBill(value: Bill | null): value is Bill {
  return value !== null;
}
