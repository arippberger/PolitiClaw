/**
 * Ballot explanation — deterministic, non-prescriptive framing per race.
 *
 * Policy anchors:
 *   • Never outputs "vote YES/NO." Renders facts and framing only.
 *   • Every claim carries a source tier, and contest-level coverage labels
 *     stay honest about what the current sources can and cannot prove.
 *   • The only LLM-search-derived content allowed here is the narrative from
 *     the `webSearch/bios` adapter, already guardrail-gated and
 *     tier-promotable only when citations are homogeneous tier-1/2.
 *
 * The framing text per contest is **slot-filled from structured data**:
 *   - Google Civic contest metadata (candidate names, referendum titles)
 *   - Declared stances whose keywords hit the contest title/subtitle
 *   - Optional bio excerpts from the web-search resolver (when wired)
 *
 * There is no LLM-of-judgment in this path: matching is keyword-only,
 * confidence falls out of the match strength + stance coverage, and the
 * "what a YES/NO vote would mean" language is deterministic.
 */

import { createHash } from "node:crypto";

import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BallotResolver } from "../../sources/ballot/index.js";
import type {
  NormalizedBallotContest,
  NormalizedBallotSnapshot,
} from "../../sources/ballot/types.js";
import type { WebSearchResolver } from "../../sources/webSearch/index.js";
import type { BioPayload } from "../../sources/webSearch/index.js";
import type { IssueStance, IssueStanceRow } from "../preferences/types.js";
import { listIssueStances } from "../preferences/index.js";
import { getBallotSnapshot } from "./index.js";
import type { GetBallotSnapshotResult } from "./index.js";

/**
 * Per-contest framing row. Every field is either from a structured source
 * (Google Civic + FEC + declared stances) or from the guarded bio adapter.
 */
export type ContestExplanation = {
  index: number;
  title: string;
  contestType: "candidate" | "measure" | "unknown";
  /** Coverage label bubbled up from the ballot renderer's tier logic. */
  coverageLabel: string;
  /** Stances whose keywords hit the contest title/subtitle. */
  stanceMatches: readonly ContestStanceMatch[];
  /** Deterministic "what would happen" framing rows. For measures this is
   *  "A YES vote would..." / "A NO vote would...". For candidate races
   *  this is a framing of what electing any candidate in this race
   *  implies relative to the user's declared stances — never a
   *  preference for a specific candidate. */
  framing: readonly FramingLine[];
  /** Bios attached to individual candidates when the web-search resolver
   *  is wired and returns data. Empty otherwise — callers must degrade
   *  gracefully. */
  candidateBios: readonly CandidateBio[];
  /** True when the contest has no stance matches and no bio data — the
   *  renderer surfaces this as "insufficient data". */
  insufficientData: boolean;
};

export type ContestStanceMatch = {
  issue: string;
  stance: IssueStance["stance"];
  stanceWeight: number;
  matchedText: string;
};

export type FramingLine = {
  /** The neutral prefix, e.g. "A YES vote would" or "Candidates in this race". */
  prefix: string;
  body: string;
};

export type CandidateBio = {
  candidateName: string;
  payload: BioPayload;
  source: { adapterId: string; tier: 1 | 2 | 5 };
};

export type ExplainMyBallotOptions = {
  refresh?: boolean;
  /** Optional web-search resolver for bio enrichment. When absent the
   *  explanation is purely structured — still useful, but bios come back
   *  empty. Tests inject this; production currently leaves bios empty unless
   *  a fetcher is wired in. */
  webSearch?: WebSearchResolver;
};

export type ExplainMyBallotResult =
  | { status: "no_preferences"; reason: string; actionable: string }
  | { status: "no_stances"; reason: string; actionable: string }
  | {
      status: "unavailable";
      reason: string;
      actionable?: string;
      adapterId?: string;
    }
  | {
      status: "ok";
      addressLine: string;
      election?: NormalizedBallotSnapshot["election"];
      ballotSource: { adapterId: string; tier: number };
      fromCache: boolean;
      stanceSnapshotHash: string;
      contests: readonly ContestExplanation[];
      /** Count of contests with no stance match and no bio data. */
      insufficientDataCount: number;
    };

/**
 * Compose an explanation by pulling the ballot snapshot, declared stances,
 * and (optionally) candidate bios, then running the deterministic framer.
 * Persists the rendered narrative to `ballot_explanations` for audit.
 */
export async function explainMyBallot(
  db: PolitiClawDb,
  resolver: BallotResolver,
  options: ExplainMyBallotOptions = {},
): Promise<ExplainMyBallotResult> {
  const stanceRows = listIssueStances(db);
  if (stanceRows.length === 0) {
    return {
      status: "no_stances",
      reason: "no declared issue stances",
      actionable:
        "call politiclaw_issue_stances with action='set' before asking for a ballot explanation",
    };
  }

  const snapshotResult: GetBallotSnapshotResult = await getBallotSnapshot(
    db,
    resolver,
    { refresh: options.refresh === true },
  );
  if (snapshotResult.status === "no_preferences") {
    return {
      status: "no_preferences",
      reason: snapshotResult.reason,
      actionable: snapshotResult.actionable,
    };
  }
  if (snapshotResult.status !== "ok") {
    return {
      status: "unavailable",
      reason: snapshotResult.reason,
      actionable: snapshotResult.actionable,
      adapterId: snapshotResult.adapterId,
    };
  }

  const activeStances = stanceRows.filter((row) => row.stance !== "neutral");
  const stanceSnapshotHash = hashStances(stanceRows);

  const contests: ContestExplanation[] = [];
  let insufficientDataCount = 0;

  for (let i = 0; i < snapshotResult.ballot.contests.length; i += 1) {
    const contest = snapshotResult.ballot.contests[i]!;
    // Sequential per contest: one bio call per candidate is fine at ballot
    // size (<30 rows); parallel fetches would also invert bio retrieval
    // order vs contest order without a sort.
    const explanation = await explainContest(
      i + 1,
      contest,
      activeStances,
      options.webSearch,
    );
    if (explanation.insufficientData) insufficientDataCount += 1;
    contests.push(explanation);
  }

  persistExplanation(
    db,
    snapshotResult.ballot.election?.electionDay,
    stanceSnapshotHash,
    snapshotResult.source,
    contests,
  );

  return {
    status: "ok",
    addressLine: snapshotResult.addressLine,
    election: snapshotResult.ballot.election,
    ballotSource: snapshotResult.source,
    fromCache: snapshotResult.fromCache,
    stanceSnapshotHash,
    contests,
    insufficientDataCount,
  };
}

async function explainContest(
  index: number,
  contest: NormalizedBallotContest,
  activeStances: readonly IssueStanceRow[],
  webSearch: WebSearchResolver | undefined,
): Promise<ContestExplanation> {
  const title = deriveContestTitle(contest);
  const kind = classifyContest(contest);
  const coverageLabel = coverageLabelFor(contest);
  const stanceMatches = matchStances(contest, activeStances);
  const framing = buildFraming(contest, kind, stanceMatches);

  let bios: CandidateBio[] = [];
  if (webSearch && kind === "candidate" && contest.candidates.length > 0) {
    bios = await fetchCandidateBios(contest, webSearch);
  }

  const insufficientData = stanceMatches.length === 0 && bios.length === 0;

  return {
    index,
    title,
    contestType: kind,
    coverageLabel,
    stanceMatches,
    framing,
    candidateBios: bios,
    insufficientData,
  };
}

function deriveContestTitle(contest: NormalizedBallotContest): string {
  return (
    contest.office ??
    contest.referendumTitle ??
    contest.districtScope ??
    "Unknown contest"
  );
}

function classifyContest(
  contest: NormalizedBallotContest,
): "candidate" | "measure" | "unknown" {
  if (contest.referendumTitle) return "measure";
  if (contest.candidates.length > 0) return "candidate";
  if (contest.office) return "candidate";
  return "unknown";
}

function coverageLabelFor(contest: NormalizedBallotContest): string {
  if (contest.referendumTitle) {
    return "PARTIAL — measure metadata from Google Civic; read the full text on your official sample ballot.";
  }
  if (contest.candidates.length > 0) {
    return "PARTIAL — candidate names/parties from Google Civic (tier 2 aggregator); verify positions against primary sources.";
  }
  return "NOT COVERED — no structured rows returned for this contest; use your official sample ballot URL.";
}

/**
 * Keyword match contest → declared stances. Same expansion rule as
 * `alignment.ts` — full slug + individual word components (length ≥ 4).
 * Matches on title, referendum title, referendum subtitle, and district
 * scope. Party/candidate names are intentionally excluded: we do not
 * want "democrat" or "republican" tokens driving stance matches.
 */
function matchStances(
  contest: NormalizedBallotContest,
  stances: readonly IssueStanceRow[],
): ContestStanceMatch[] {
  const haystacks: { location: string; text: string }[] = [];
  if (contest.office) haystacks.push({ location: "title", text: contest.office });
  if (contest.referendumTitle)
    haystacks.push({ location: "referendum title", text: contest.referendumTitle });
  if (contest.referendumSubtitle)
    haystacks.push({ location: "referendum subtitle", text: contest.referendumSubtitle });
  if (contest.districtScope)
    haystacks.push({ location: "district scope", text: contest.districtScope });

  const matches: ContestStanceMatch[] = [];
  for (const stance of stances) {
    const keywords = expandKeywords(stance.issue);
    for (const hay of haystacks) {
      const hit = firstKeywordHit(keywords, hay.text);
      if (hit) {
        matches.push({
          issue: stance.issue,
          stance: stance.stance,
          stanceWeight: stance.weight,
          matchedText: `${hay.location} keyword '${hit}'`,
        });
        break;
      }
    }
  }
  return matches;
}

function expandKeywords(issue: string): string[] {
  const words = issue.split("-").filter(Boolean);
  const combined = words.join(" ");
  const set = new Set<string>();
  if (combined) set.add(combined);
  for (const word of words) if (word.length >= 4) set.add(word);
  return [...set];
}

function firstKeywordHit(
  keywords: readonly string[],
  text: string | undefined,
): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) return keyword;
  }
  return null;
}

/**
 * Deterministic slot-filled framing. For measures we render a
 * symmetric YES/NO comparison. For candidate races we enumerate what
 * electing *any* candidate implies relative to declared stances —
 * never picking a candidate.
 */
function buildFraming(
  contest: NormalizedBallotContest,
  kind: "candidate" | "measure" | "unknown",
  matches: readonly ContestStanceMatch[],
): FramingLine[] {
  if (kind === "measure") {
    const title = contest.referendumTitle ?? "this measure";
    const subtitle = contest.referendumSubtitle;
    const lines: FramingLine[] = [];
    if (subtitle && subtitle.trim().length > 0) {
      lines.push({
        prefix: "Summary (as published)",
        body: subtitle.trim(),
      });
    }
    lines.push({
      prefix: "A YES vote would",
      body:
        subtitle && subtitle.trim().length > 0
          ? "enact the change described in the published summary above."
          : `enact whatever ${title} proposes — read the full text on your official sample ballot before voting.`,
    });
    lines.push({
      prefix: "A NO vote would",
      body: "leave current law unchanged on this question.",
    });
    for (const match of matches) {
      const direction = match.stance === "support" ? "support" : "opposition";
      lines.push({
        prefix: `Your declared stance (${match.issue}, ${direction}, weight ${match.stanceWeight})`,
        body: `this measure matched on ${match.matchedText}. Direction unclear from the published summary alone — read the full measure text (or a paired federal bill, if any) to decide whether a YES advances or obstructs your stance.`,
      });
    }
    return lines;
  }

  if (kind === "candidate") {
    const office = contest.office ?? "this office";
    const lines: FramingLine[] = [
      {
        prefix: "What this race decides",
        body: `who represents you in ${office}.`,
      },
      {
        prefix: "What the candidate rows below show",
        body: "names and party labels from Google Civic. Verify positions against official candidate sites and primary sources before voting.",
      },
    ];
    for (const match of matches) {
      const direction = match.stance === "support" ? "support" : "opposition";
      lines.push({
        prefix: `Your declared stance (${match.issue}, ${direction}, weight ${match.stanceWeight})`,
        body: `this office description matched on ${match.matchedText}. Directional framing requires per-candidate source text — consult candidate sites, politiclaw_research_finance with mode='candidate' for federal finance, or politiclaw_score_representative for a sitting member's record.`,
      });
    }
    return lines;
  }

  return [
    {
      prefix: "Contest type",
      body: "unknown — no office or referendum title was returned. Use your official sample ballot.",
    },
  ];
}

async function fetchCandidateBios(
  contest: NormalizedBallotContest,
  webSearch: WebSearchResolver,
): Promise<CandidateBio[]> {
  const out: CandidateBio[] = [];
  for (const candidate of contest.candidates) {
    if (!candidate.name) continue;
    const result = await webSearch.bio({
      name: candidate.name,
      category: "candidate.bio",
      office: officeHintFromContest(contest),
      context: contest.office,
    });
    if (result.status !== "ok") continue;
    // `promoteLlmSearchTier` is the only path that produces `tier` here,
    // and it is constrained to 1 | 2 | 5. Other adapters cannot reach
    // this code path.
    const tier = result.tier === 1 || result.tier === 2 ? result.tier : 5;
    out.push({
      candidateName: candidate.name,
      payload: result.data,
      source: { adapterId: result.adapterId, tier },
    });
  }
  return out;
}

function officeHintFromContest(
  contest: NormalizedBallotContest,
): "H" | "S" | "P" | "state" | "local" | undefined {
  const office = contest.office?.toLowerCase() ?? "";
  if (office.includes("president")) return "P";
  if (office.includes("senate") && office.includes("u.s")) return "S";
  if (office.includes("house") && office.includes("u.s")) return "H";
  if (office.includes("state")) return "state";
  return undefined;
}

function hashStances(stances: readonly IssueStanceRow[]): string {
  const normalized = [...stances]
    .map((s) => ({ issue: s.issue, stance: s.stance, weight: s.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}

function persistExplanation(
  db: PolitiClawDb,
  electionDay: string | undefined,
  stanceSnapshotHash: string,
  source: { adapterId: string; tier: number },
  contests: readonly ContestExplanation[],
): void {
  const narrative = JSON.stringify(contests);
  const coverageJson = JSON.stringify(
    contests.map((c) => ({
      index: c.index,
      title: c.title,
      coverageLabel: c.coverageLabel,
      contestType: c.contestType,
      insufficientData: c.insufficientData,
      bioTierSet: c.candidateBios.map((b) => b.source.tier),
    })),
  );
  db.prepare(
    `INSERT INTO ballot_explanations
       (election_day, stance_snapshot_hash, narrative_text, coverage_json,
        computed_at, source_adapter_id, source_tier)
     VALUES
       (@election_day, @stance_hash, @narrative, @coverage, @computed_at,
        @adapter_id, @tier)`,
  ).run({
    election_day: electionDay ?? null,
    stance_hash: stanceSnapshotHash,
    narrative,
    coverage: coverageJson,
    computed_at: Date.now(),
    adapter_id: source.adapterId,
    tier: source.tier,
  });
}
