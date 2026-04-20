import type { AdapterHealth, AdapterResult, SourceAdapter } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type { Rep, RepQuery } from "./types.js";

const GEOCODIO_BASE = "https://api.geocod.io/v1.7";

type Fetcher = typeof fetch;

export type GeocodioAdapterOptions = {
  apiKey: string;
  /** Overrideable for tests. Defaults to global fetch. */
  fetcher?: Fetcher;
  /** Overrideable for tests. Defaults to Date.now. */
  now?: () => number;
};

type GeocodioLegislator = {
  type?: string;
  bio?: { first_name?: string; last_name?: string; party?: string };
  contact?: Record<string, unknown>;
  references?: { bioguide_id?: string };
};

type GeocodioCd = {
  name?: string;
  district_number?: number;
  congress_number?: number;
  state_abbreviation?: string;
  current_legislators?: GeocodioLegislator[];
};

type GeocodioResult = {
  fields?: { congressional_districts?: GeocodioCd[] };
};

type GeocodioResponse = {
  results?: GeocodioResult[];
  error?: string;
};

export function createGeocodioAdapter(opts: GeocodioAdapterOptions): SourceAdapter<RepQuery, Rep[]> {
  const fetcher = opts.fetcher ?? fetch;
  const now = opts.now ?? Date.now;
  const ID = "geocodio";
  const TIER = 2 as const;

  return {
    id: ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      if (!opts.apiKey) return { status: "unavailable", reason: "missing geocodio api key" };
      return { status: "ok" };
    },

    async fetch(q: RepQuery): Promise<AdapterResult<Rep[]>> {
      if (!opts.apiKey) {
        return unavailable(ID, "missing geocodio api key", "set plugins.politiclaw.apiKeys.geocodio");
      }

      const url = new URL(`${GEOCODIO_BASE}/geocode`);
      url.searchParams.set("q", q.address);
      url.searchParams.set("fields", "cd");
      url.searchParams.set("api_key", opts.apiKey);

      const res = await fetcher(url);
      if (!res.ok) {
        return unavailable(ID, `geocodio http ${res.status}`, "check api key validity + quota");
      }
      const body = (await res.json()) as GeocodioResponse;
      if (body.error) return unavailable(ID, `geocodio error: ${body.error}`);

      const first = body.results?.[0];
      const districts = first?.fields?.congressional_districts ?? [];
      if (districts.length === 0) {
        return unavailable(ID, "no congressional district found for this address");
      }

      const reps: Rep[] = [];
      for (const cd of districts) {
        for (const leg of cd.current_legislators ?? []) {
          const rep = mapLegislator(leg, cd);
          if (rep) reps.push(rep);
        }
      }

      if (reps.length === 0) {
        return unavailable(ID, "geocodio returned a district but no current legislators");
      }

      return {
        status: "ok",
        adapterId: ID,
        tier: TIER,
        data: reps,
        fetchedAt: now(),
      };
    },
  };
}

function mapLegislator(leg: GeocodioLegislator, cd: GeocodioCd): Rep | null {
  const first = leg.bio?.first_name ?? "";
  const last = leg.bio?.last_name ?? "";
  const name = [first, last].filter(Boolean).join(" ").trim();
  if (!name) return null;

  const bioguide = leg.references?.bioguide_id;
  const state = cd.state_abbreviation;
  const type = (leg.type ?? "").toLowerCase();

  let office: Rep["office"];
  let district: string | undefined;
  if (type === "senator") {
    office = "US Senate";
  } else if (type === "representative") {
    office = "US House";
    district = cd.district_number !== undefined ? String(cd.district_number) : undefined;
  } else {
    return null;
  }

  const id = bioguide ?? syntheticId(office, state, district, name);

  return {
    id,
    name,
    office,
    party: leg.bio?.party,
    state,
    district,
    contact: leg.contact,
  };
}

function syntheticId(
  office: Rep["office"],
  state: string | undefined,
  district: string | undefined,
  name: string,
): string {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, "-").replace(/(^-|-$)/g, "");
  const officeSlug = office === "US Senate" ? "sen" : "rep";
  const suffix = district ? `${state ?? "xx"}-${district}` : (state ?? "xx");
  return `${officeSlug}-${suffix}-${slug}`;
}
