import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type {
  Bill,
  BillListFilters,
  BillRef,
  BillSponsor,
} from "./types.js";
import { billIdOf } from "./types.js";
import type { BillsAdapter } from "./congressGov.js";

type Fetcher = (input: URL | string | Request, init?: RequestInit) => Promise<Response>;

export type UnitedstatesScraperAdapterOptions = {
  /**
   * Base URL of a self-hosted `unitedstates/congress` scraper output mirror.
   * The adapter expects the canonical layout:
   *   {baseUrl}/{congress}/bills/{billtype}/{billtype}{number}/data.json
   * Trailing slash optional; both forms are accepted.
   */
  baseUrl: string;
  fetcher?: Fetcher;
  now?: () => number;
};

type ScraperSponsor = {
  bioguide_id?: string;
  name?: string;
  title?: string;
  state?: string;
  district?: string | number;
  party?: string;
};

type ScraperSummary = {
  text?: string;
  date?: string;
  as?: string;
};

type ScraperBillData = {
  bill_id?: string;
  bill_type?: string;
  number?: string | number;
  congress?: string | number;
  introduced_at?: string;
  updated_at?: string;
  official_title?: string;
  short_title?: string;
  popular_title?: string;
  subjects_top_term?: string;
  subjects?: string[];
  summary?: ScraperSummary | null;
  sponsor?: ScraperSponsor | null;
  latest_major_action?: string;
  latest_major_action_at?: string;
  status?: string;
  status_at?: string;
};

const ID = "unitedstatesScraper";
// Civic-infrastructure aggregator (scraper output of public-domain congress.gov data).
const TIER: SourceTier = 2;

export function createUnitedstatesScraperAdapter(
  opts: UnitedstatesScraperAdapterOptions,
): BillsAdapter {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;
  const baseUrl = stripTrailingSlash(opts.baseUrl);

  return {
    id: ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      if (!baseUrl) {
        return { status: "unavailable", reason: "missing scraperBaseUrl" };
      }
      return { status: "degraded", reason: "scraper output trails api.congress.gov by ~24h" };
    },

    /**
     * The scraper output is organized by `{congress}/bills/{type}/{type}{number}/`
     * — there is no date-range listing surface. Listing requires apiDataGov.
     */
    async list(_filters: BillListFilters): Promise<AdapterResult<Bill[]>> {
      return unavailable(
        ID,
        "scraper fallback does not support bill listing (no date-range index)",
        "set plugins.politiclaw.apiKeys.apiDataGov for list/search; the scraper covers single-bill lookups only",
      );
    },

    async get(ref: BillRef): Promise<AdapterResult<Bill>> {
      if (!baseUrl) {
        return unavailable(ID, "missing scraperBaseUrl");
      }

      const url = buildDetailUrl(baseUrl, ref);
      let response: Response;
      try {
        response = await fetcher(url);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return unavailable(ID, `scraper fetch failed: ${reason}`);
      }

      if (response.status === 404) {
        return unavailable(
          ID,
          `bill not found at scraper mirror (${ref.congress}-${ref.billType.toLowerCase()}-${ref.number})`,
        );
      }
      if (!response.ok) {
        return unavailable(ID, `scraper http ${response.status}`);
      }

      let body: ScraperBillData;
      try {
        body = (await response.json()) as ScraperBillData;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        return unavailable(ID, `scraper returned malformed json: ${reason}`);
      }

      const bill = normalizeScraperBill(body, ref);
      if (!bill) {
        return unavailable(ID, "scraper data.json missing required fields (congress, type, number)");
      }

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

function buildDetailUrl(baseUrl: string, ref: BillRef): string {
  const billType = ref.billType.toLowerCase();
  return `${baseUrl}/${ref.congress}/bills/${billType}/${billType}${ref.number}/data.json`;
}

function normalizeScraperBill(raw: ScraperBillData, ref: BillRef): Bill | null {
  const congress = toNumber(raw.congress) ?? ref.congress;
  const number = raw.number !== undefined ? String(raw.number) : ref.number;
  const billType = (raw.bill_type ?? ref.billType).toUpperCase();
  if (!congress || !number || !billType) return null;

  const title = pickTitle(raw);
  const sponsor = normalizeSponsor(raw.sponsor);
  const summaryText = raw.summary?.text?.trim() || undefined;

  return {
    id: billIdOf({ congress, billType, number }),
    congress,
    billType,
    number,
    title,
    introducedDate: raw.introduced_at,
    latestActionDate: raw.latest_major_action_at ?? raw.status_at,
    latestActionText: raw.latest_major_action,
    policyArea: raw.subjects_top_term,
    subjects: raw.subjects && raw.subjects.length > 0 ? raw.subjects : undefined,
    summaryText,
    sponsors: sponsor ? [sponsor] : undefined,
    updateDate: raw.updated_at,
  };
}

function pickTitle(raw: ScraperBillData): string {
  const candidate =
    raw.official_title?.trim() ??
    raw.short_title?.trim() ??
    raw.popular_title?.trim();
  return candidate || "(untitled)";
}

function normalizeSponsor(raw: ScraperSponsor | null | undefined): BillSponsor | null {
  if (!raw) return null;
  const name = raw.name?.trim();
  if (!name) return null;
  return {
    bioguideId: raw.bioguide_id,
    fullName: formatSponsorName(name, raw.title),
    party: raw.party,
    state: raw.state,
    district: raw.district !== undefined ? String(raw.district) : undefined,
  };
}

function formatSponsorName(name: string, title: string | undefined): string {
  if (!title) return name;
  const prefix = title.trim().replace(/\.$/, "");
  return `${prefix}. ${name}`;
}

function toNumber(value: string | number | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}
