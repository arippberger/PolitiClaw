import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { FinanceResolver } from "../../sources/finance/index.js";
import type {
  FederalCandidateFinancialTotals,
  FederalCandidateRef,
} from "../../sources/finance/index.js";
import type { StoredRep } from "../reps/index.js";
import { listReps } from "../reps/index.js";

/**
 * Map a stored rep to its FEC race coordinates.
 *
 * `unmappable` is not an error — Senate reps always map, House reps map when
 * their district column is populated, but other `RepOffice` values (e.g.
 * state legislators surfaced via a future phase) cannot be resolved to a
 * federal race and must surface as "not covered" rather than as a
 * misattributed FEC lookup.
 */
export type RaceCoordinates =
  | { status: "ok"; office: "H" | "S"; state: string; district?: string; cycle: number }
  | { status: "unmappable"; reason: string };

const SENATE_CYCLE_REQUIRED =
  "Senate terms are six-year; pass the explicit election cycle for this senator's race.";

export function raceCoordinatesFor(rep: StoredRep, cycle: number): RaceCoordinates {
  if (!rep.state) {
    return { status: "unmappable", reason: `rep ${rep.id} has no state on file` };
  }
  if (rep.office === "US House") {
    if (!rep.district) {
      return { status: "unmappable", reason: `rep ${rep.id} is House but has no district` };
    }
    return {
      status: "ok",
      office: "H",
      state: rep.state.toUpperCase(),
      district: rep.district,
      cycle,
    };
  }
  if (rep.office === "US Senate") {
    return { status: "ok", office: "S", state: rep.state.toUpperCase(), cycle };
  }
  return {
    status: "unmappable",
    reason: `rep ${rep.id} office "${rep.office}" is not a federal race this tool covers`,
  };
}

/** Default cycle: current calendar year if even, else next year. */
export function defaultCycleFor(now: Date): number {
  const year = now.getUTCFullYear();
  return year % 2 === 0 ? year : year + 1;
}

/**
 * One candidate row inside a rendered race comparison. `incumbent` is true
 * when FEC flags the candidate as I (Incumbent) — never inferred from name
 * matches, since the user's stored rep name and FEC's `name` field are
 * independently sourced and drift in ordering/capitalization.
 */
export type ChallengerRow = {
  candidate: FederalCandidateRef;
  totals: FederalCandidateFinancialTotals | null;
  incumbent: boolean;
};

export type RaceComparison = {
  rep: StoredRep;
  /** Race coordinates used to query FEC (redundant with rep but explicit for audit). */
  race: { office: "H" | "S"; state: string; district?: string; cycle: number };
  rows: ChallengerRow[];
  /** `ok` when at least one FEC candidate came back; `no_candidates` when FEC
   *  returned nothing for this race (most common in uncontested primaries
   *  before filing deadlines). */
  status: "ok" | "no_candidates";
};

export type RepChallengerResult =
  | { status: "ok"; race: RaceComparison }
  | { status: "unmappable"; rep: StoredRep; reason: string }
  | {
      status: "unavailable";
      rep: StoredRep;
      reason: string;
      actionable?: string;
      adapterId?: string;
    };

export type CompareChallengersOptions = {
  /** If set, scope to a single stored rep; otherwise iterate every rep. */
  repId?: string;
  /** FEC election cycle (e.g. 2026). Defaults to the current/next even year. */
  cycle?: number;
  /** Clock override for tests. */
  now?: () => number;
};

export type CompareChallengersResult =
  | { status: "no_reps"; reason: string; actionable: string }
  | { status: "unavailable"; reason: string; actionable?: string; adapterId?: string }
  | { status: "ok"; cycle: number; rows: RepChallengerResult[] };

function isIncumbentFlag(raw: FederalCandidateRef["incumbentChallengeStatus"]): boolean {
  if (!raw) return false;
  const lower = raw.toLowerCase();
  return lower === "i" || lower === "incumbent";
}

/**
 * For the given rep, query FEC for every candidate in that race + per-cycle
 * totals, and fold them into a comparison row.
 *
 * Totals fetches run in parallel per race; a single candidate's totals
 * failure degrades that row (`totals: null`) rather than collapsing the
 * whole race — the tool layer labels these honestly.
 */
export async function compareChallengersForRep(
  rep: StoredRep,
  resolver: FinanceResolver,
  cycle: number,
): Promise<RepChallengerResult> {
  const coords = raceCoordinatesFor(rep, cycle);
  if (coords.status !== "ok") {
    return { status: "unmappable", rep, reason: coords.reason };
  }
  if (rep.office === "US Senate" && !Number.isInteger(cycle)) {
    return { status: "unmappable", rep, reason: SENATE_CYCLE_REQUIRED };
  }

  const search = await resolver.searchCandidates({
    office: coords.office,
    state: coords.state,
    district: coords.district,
    cycle: coords.cycle,
    perPage: 50,
  });
  if (search.status !== "ok") {
    return {
      status: "unavailable",
      rep,
      reason: search.reason,
      actionable: search.actionable,
      adapterId: search.adapterId,
    };
  }

  const candidates = search.data;
  if (candidates.length === 0) {
    return {
      status: "ok",
      race: {
        rep,
        race: { office: coords.office, state: coords.state, district: coords.district, cycle },
        rows: [],
        status: "no_candidates",
      },
    };
  }

  const rowResults = await Promise.all(
    candidates.map(async (candidate) => {
      const totals = await resolver.getCandidateTotals(candidate.candidateId, cycle);
      // Strict cycle match only. FEC sometimes returns adjacent cycles even
      // with `?cycle=` set; picking `data[0]` would silently render (say)
      // 2024 numbers under a "cycle 2026" banner. Surface the gap honestly
      // instead — the renderer prints "no FEC totals available for this
      // cycle yet" when `totals` is null.
      const matching =
        totals.status === "ok"
          ? totals.data.find((row) => row.cycle === cycle) ?? null
          : null;
      return {
        candidate,
        totals: matching,
        incumbent: isIncumbentFlag(candidate.incumbentChallengeStatus),
      } satisfies ChallengerRow;
    }),
  );

  rowResults.sort((a, b) => {
    if (a.incumbent !== b.incumbent) return a.incumbent ? -1 : 1;
    const left = a.totals?.receipts ?? -1;
    const right = b.totals?.receipts ?? -1;
    return right - left;
  });

  return {
    status: "ok",
    race: {
      rep,
      race: { office: coords.office, state: coords.state, district: coords.district, cycle },
      rows: rowResults,
      status: "ok",
    },
  };
}

export async function compareChallengers(
  db: PolitiClawDb,
  resolver: FinanceResolver,
  options: CompareChallengersOptions = {},
): Promise<CompareChallengersResult> {
  const nowFn = options.now ?? Date.now;
  const cycle = options.cycle ?? defaultCycleFor(new Date(nowFn()));

  const allReps = listReps(db);
  const reps = options.repId ? allReps.filter((rep) => rep.id === options.repId) : allReps;
  if (reps.length === 0) {
    if (options.repId) {
      return {
        status: "no_reps",
        reason: `no stored rep with id "${options.repId}"`,
        actionable: "call politiclaw_get_my_reps first, then retry with an id from that list",
      };
    }
    return {
      status: "no_reps",
      reason: "no representatives stored",
      actionable: "call politiclaw_get_my_reps first",
    };
  }

  const rows: RepChallengerResult[] = [];
  for (const rep of reps) {
    rows.push(await compareChallengersForRep(rep, resolver, cycle));
  }

  const everyFailed = rows.every((row) => row.status === "unavailable");
  const firstUnavailable = rows.find(
    (row): row is Extract<RepChallengerResult, { status: "unavailable" }> =>
      row.status === "unavailable",
  );
  if (everyFailed && firstUnavailable) {
    return {
      status: "unavailable",
      reason: firstUnavailable.reason,
      actionable: firstUnavailable.actionable,
      adapterId: firstUnavailable.adapterId,
    };
  }

  return { status: "ok", cycle, rows };
}
