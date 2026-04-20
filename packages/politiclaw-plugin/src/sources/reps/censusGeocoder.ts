const CENSUS_GEOCODER_URL =
  "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress";

type Fetcher = typeof fetch;

type CensusCoordinates = {
  x?: number;
  y?: number;
};

type CensusAddressMatch = {
  coordinates?: CensusCoordinates;
};

type CensusResult = {
  addressMatches?: CensusAddressMatch[];
};

type CensusResponse = {
  result?: CensusResult;
};

export type GeocodeResult =
  | { status: "ok"; lat: number; lon: number }
  | { status: "unavailable"; reason: string; actionable?: string };

export async function geocodeAddress(
  address: string,
  opts: { fetcher?: Fetcher } = {},
): Promise<GeocodeResult> {
  const fetcher = opts.fetcher ?? fetch;
  const url = new URL(CENSUS_GEOCODER_URL);
  url.searchParams.set("address", address);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");

  const response = await fetcher(url);
  if (!response.ok) {
    return {
      status: "unavailable",
      reason: `census geocoder http ${response.status}`,
      actionable: "retry in a minute or use plugins.politiclaw.apiKeys.geocodio",
    };
  }

  const body = (await response.json()) as CensusResponse;
  const firstMatch = body.result?.addressMatches?.[0];
  const longitude = firstMatch?.coordinates?.x;
  const latitude = firstMatch?.coordinates?.y;
  if (typeof latitude !== "number" || typeof longitude !== "number") {
    return {
      status: "unavailable",
      reason: "census geocoder returned no coordinate match for this address",
      actionable: "check the address formatting and retry",
    };
  }

  return { status: "ok", lat: latitude, lon: longitude };
}
