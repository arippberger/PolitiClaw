/**
 * Adapter-agnostic shape for an elected federal representative.
 * Extended later (state/local) by adding offices to the `office` union.
 */
export type RepOffice = "US Senate" | "US House";

export type Rep = {
  /** Stable external id (bioguide where the adapter provides it; falls back to a synthetic id). */
  id: string;
  name: string;
  office: RepOffice;
  party?: string;
  /** 2-letter state code. */
  state?: string;
  /** Numeric district; House only. */
  district?: string;
  /** Adapter-shaped contact blob (phone, url, mailing address). */
  contact?: Record<string, unknown>;
};

export type RepQuery = {
  address: string;
};
