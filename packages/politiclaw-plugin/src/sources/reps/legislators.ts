import { load } from "js-yaml";
import type { Rep } from "./types.js";

type YamlTerm = {
  type?: string;
  state?: string;
  district?: number;
  party?: string;
  start?: string;
  end?: string;
};

type YamlName = {
  official_full?: string;
  first?: string;
  last?: string;
};

type YamlId = {
  bioguide?: string;
};

type LegislatorYamlRecord = {
  name?: YamlName;
  id?: YamlId;
  terms?: YamlTerm[];
};

type NormalizedLegislator = {
  bioguide: string;
  name: string;
  office: Rep["office"];
  state: string;
  district?: string;
  party?: string;
};

export function parseLegislators(yamlText: string, now: Date = new Date()): NormalizedLegislator[] {
  const parsed = load(yamlText);
  if (!Array.isArray(parsed)) return [];

  const items: NormalizedLegislator[] = [];
  for (const record of parsed as LegislatorYamlRecord[]) {
    const bioguide = record.id?.bioguide;
    const name = normalizedName(record.name);
    if (!bioguide || !name) continue;

    const term = currentTerm(record.terms ?? [], now);
    if (!term?.state) continue;

    if (term.type === "sen") {
      items.push({
        bioguide,
        name,
        office: "US Senate",
        state: term.state,
        party: term.party,
      });
      continue;
    }

    if (term.type === "rep" && typeof term.district === "number") {
      items.push({
        bioguide,
        name,
        office: "US House",
        state: term.state,
        district: String(term.district),
        party: term.party,
      });
    }
  }
  return items;
}

export function resolveFederalReps(
  legislators: NormalizedLegislator[],
  districtInfo: { state: string; houseDistrict: string },
): Rep[] {
  const senators = legislators
    .filter((item) => item.office === "US Senate" && item.state === districtInfo.state)
    .map(toRep);
  const house = legislators
    .filter(
      (item) =>
        item.office === "US House" &&
        item.state === districtInfo.state &&
        item.district === districtInfo.houseDistrict,
    )
    .map(toRep);

  return [...senators, ...house];
}

function toRep(item: NormalizedLegislator): Rep {
  return {
    id: item.bioguide,
    name: item.name,
    office: item.office,
    party: item.party,
    state: item.state,
    district: item.district,
  };
}

function normalizedName(name: YamlName | undefined): string | null {
  if (!name) return null;
  if (name.official_full && name.official_full.trim()) return name.official_full.trim();
  const merged = [name.first ?? "", name.last ?? ""].join(" ").trim();
  return merged || null;
}

function currentTerm(terms: YamlTerm[], now: Date): YamlTerm | null {
  const nowMillis = now.getTime();
  let bestMatch: YamlTerm | null = null;
  for (const term of terms) {
    if (!term.start || !term.end) continue;
    const startMillis = Date.parse(term.start);
    const endMillis = Date.parse(term.end);
    if (Number.isNaN(startMillis) || Number.isNaN(endMillis)) continue;
    if (startMillis <= nowMillis && nowMillis <= endMillis) {
      if (!bestMatch || Date.parse(bestMatch.end ?? "") < endMillis) {
        bestMatch = term;
      }
    }
  }
  return bestMatch;
}

export type { NormalizedLegislator };
