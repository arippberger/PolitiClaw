import booleanPointInPolygon from "@turf/boolean-point-in-polygon";

type DistrictFeature = {
  type: "Feature";
  properties: { STATEFP?: string; CD119FP?: string } | null;
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
};

export function findContainingDistrict(
  coordinate: { lat: number; lon: number },
  districts: GeoJSON.FeatureCollection,
): { state: string; district: string } | null {
  const point: GeoJSON.Feature<GeoJSON.Point> = {
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: [coordinate.lon, coordinate.lat] },
  };

  for (const feature of districts.features as DistrictFeature[]) {
    const state = feature.properties?.STATEFP;
    const district = feature.properties?.CD119FP;
    if (!state || !district) continue;
    if (booleanPointInPolygon(point, feature)) {
      return { state: fipsToState(state), district: String(Number.parseInt(district, 10)) };
    }
  }

  return null;
}

const FIPS_TO_STATE: Record<string, string> = {
  "01": "AL",
  "02": "AK",
  "04": "AZ",
  "05": "AR",
  "06": "CA",
  "08": "CO",
  "09": "CT",
  "10": "DE",
  "11": "DC",
  "12": "FL",
  "13": "GA",
  "15": "HI",
  "16": "ID",
  "17": "IL",
  "18": "IN",
  "19": "IA",
  "20": "KS",
  "21": "KY",
  "22": "LA",
  "23": "ME",
  "24": "MD",
  "25": "MA",
  "26": "MI",
  "27": "MN",
  "28": "MS",
  "29": "MO",
  "30": "MT",
  "31": "NE",
  "32": "NV",
  "33": "NH",
  "34": "NJ",
  "35": "NM",
  "36": "NY",
  "37": "NC",
  "38": "ND",
  "39": "OH",
  "40": "OK",
  "41": "OR",
  "42": "PA",
  "44": "RI",
  "45": "SC",
  "46": "SD",
  "47": "TN",
  "48": "TX",
  "49": "UT",
  "50": "VT",
  "51": "VA",
  "53": "WA",
  "54": "WV",
  "55": "WI",
  "56": "WY",
};

function fipsToState(fips: string): string {
  return FIPS_TO_STATE[fips] ?? fips;
}
