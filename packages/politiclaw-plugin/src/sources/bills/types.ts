/**
 * Adapter-agnostic shape for a federal bill. Normalized across api.congress.gov
 * and (future) the `unitedstates/congress` scraper output.
 *
 * `id` is the canonical PolitiClaw key: lowercase `<congress>-<billType>-<number>`.
 */
export type Bill = {
  id: string;
  congress: number;
  /** Uppercase bill type — HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES. */
  billType: string;
  number: string;
  title: string;
  originChamber?: "House" | "Senate";
  introducedDate?: string;
  latestActionDate?: string;
  latestActionText?: string;
  policyArea?: string;
  subjects?: string[];
  summaryText?: string;
  sponsors?: BillSponsor[];
  updateDate?: string;
  sourceUrl?: string;
};

export type BillSponsor = {
  bioguideId?: string;
  fullName: string;
  party?: string;
  state?: string;
  district?: string;
};

export type BillRef = {
  congress: number;
  /** Accepts any case; normalized to lowercase on the wire, uppercase in stored rows. */
  billType: string;
  number: string;
};

export type BillListFilters = {
  congress?: number;
  billType?: string;
  /** ISO-8601 timestamp. Passed through to api.congress.gov `fromDateTime`. */
  fromDateTime?: string;
  toDateTime?: string;
  /** Case-insensitive substring match against bill title (applied client-side). */
  titleContains?: string;
  limit?: number;
  offset?: number;
};

export function billIdOf(ref: BillRef): string {
  return `${ref.congress}-${ref.billType.toLowerCase()}-${ref.number}`;
}

/** Maps canonical lowercase bill-type segment to congress.gov URL path segment. */
const CONGRESS_GOV_BILL_SLUGS: Record<string, string> = {
  hr: "house-bill",
  s: "senate-bill",
  hres: "house-resolution",
  sres: "senate-resolution",
  hjres: "house-joint-resolution",
  sjres: "senate-joint-resolution",
  hconres: "house-concurrent-resolution",
  sconres: "senate-concurrent-resolution",
};

/**
 * Public congress.gov bill page URL for a canonical PolitiClaw bill id
 * (`119-hr-1234`). Returns null when the id cannot be mapped.
 */
export function congressGovPublicBillUrl(canonicalBillId: string): string | null {
  const trimmed = canonicalBillId.trim().toLowerCase();
  const parts = trimmed.split("-");
  if (parts.length < 3) {
    return null;
  }
  const congress = parts[0];
  const billType = parts[1];
  const number = parts.slice(2).join("-");
  if (!congress || !/^\d+$/.test(congress) || !billType) {
    return null;
  }
  const slug = CONGRESS_GOV_BILL_SLUGS[billType];
  if (!slug) {
    return null;
  }
  return `https://www.congress.gov/bill/${congress}/${slug}/${number}`;
}
