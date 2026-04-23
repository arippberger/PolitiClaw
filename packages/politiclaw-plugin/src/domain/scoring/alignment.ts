import { createHash } from "node:crypto";
import type { Bill } from "../../sources/bills/types.js";
import type { IssueStance } from "../preferences/types.js";

/**
 * Any alignment score with confidence < {@link CONFIDENCE_FLOOR} must render
 * as "insufficient data" in user-facing text. Raw numbers are still stored
 * for audit.
 */
export const CONFIDENCE_FLOOR = 0.4;

/**
 * Thresholds that classify a rep's per-issue alignment into the 3-band
 * accountability pattern shown on rep reports. All pattern logic gates on
 * `!belowConfidenceFloor` first; below-floor issues never contribute.
 *
 * - `PATTERN_CONCERNING_MAX` — alignment below this, on a high-weight issue,
 *   flags the rep's pattern as `concerning`.
 * - `PATTERN_ALIGNED_MIN` — alignment at or above this counts as aligned on
 *   an issue; a rep with every above-floor issue at this level is `aligned`.
 */
export const PATTERN_CONCERNING_MAX = 0.4;
export const PATTERN_ALIGNED_MIN = 0.7;

/**
 * Minimum stance weight (1–5 scale) at which a below-threshold alignment on
 * a single issue is enough to tip the rep's whole pattern into `concerning`.
 * Below this weight, the issue still shows its numbers but won't by itself
 * dominate the rep-level band.
 */
export const PATTERN_CONCERNING_MIN_WEIGHT = 4;

export const ALIGNMENT_DISCLAIMER =
  "This is informational, not independent journalism. Directional framing compares bill text to your declared stances; verify against neutral sources before voting or contacting officials.";

type MatchLocation = "policyArea" | "subject" | "title" | "summary";

const LOCATION_WEIGHT: Record<MatchLocation, number> = {
  policyArea: 1.0,
  subject: 0.9,
  title: 0.6,
  summary: 0.4,
};

export type StanceMatch = {
  issue: string;
  stance: IssueStance["stance"];
  stanceWeight: number;
  location: MatchLocation;
  matchedText: string;
};

export type AlignmentResult = {
  relevance: number;
  confidence: number;
  matches: StanceMatch[];
  rationale: string;
  stanceSnapshotHash: string;
  belowConfidenceFloor: boolean;
};

/**
 * Deterministic bill-to-stances alignment. No LLM involved. The score
 * measures whether a bill touches issues the user declared, not whether the
 * user should vote for or against it.
 * Direction ("does this advance or obstruct my stance?") requires either
 * user stance_signals on similar bills or the rep's actual vote; neither
 * is in scope for this function.
 */
export function computeBillAlignment(
  bill: Bill,
  stances: readonly IssueStance[],
): AlignmentResult {
  const activeStances = stances.filter((stance) => stance.stance !== "neutral");
  const stanceSnapshotHash = hashStances(stances);
  const matches: StanceMatch[] = [];

  for (const stance of activeStances) {
    const match = matchStanceAgainstBill(stance, bill);
    if (match) matches.push(match);
  }

  const relevance = computeRelevance(matches);
  const confidence = computeConfidence(bill, stances, matches);
  const rationale = buildRationale(bill, stances, matches);

  return {
    relevance,
    confidence,
    matches,
    rationale,
    stanceSnapshotHash,
    belowConfidenceFloor: confidence < CONFIDENCE_FLOOR,
  };
}

function matchStanceAgainstBill(stance: IssueStance, bill: Bill): StanceMatch | null {
  const keywords = expandKeywords(stance.issue);
  const base = {
    issue: stance.issue,
    stance: stance.stance,
    stanceWeight: stance.weight,
  };

  const policyHit = firstKeywordHit(keywords, bill.policyArea);
  if (policyHit) {
    return {
      ...base,
      location: "policyArea",
      matchedText: `policy area '${bill.policyArea!}'`,
    };
  }

  for (const subject of bill.subjects ?? []) {
    const hit = firstKeywordHit(keywords, subject);
    if (hit) {
      return {
        ...base,
        location: "subject",
        matchedText: `subject '${subject}'`,
      };
    }
  }

  const titleHit = firstKeywordHit(keywords, bill.title);
  if (titleHit) {
    return {
      ...base,
      location: "title",
      matchedText: `title keyword '${titleHit}'`,
    };
  }

  const summaryHit = firstKeywordHit(keywords, stripHtml(bill.summaryText));
  if (summaryHit) {
    return {
      ...base,
      location: "summary",
      matchedText: `summary keyword '${summaryHit}'`,
    };
  }

  return null;
}

/**
 * Expand a kebab-case issue slug into a handful of matchable keywords.
 * Keeps the slug's full text as well as its word components so
 * "affordable-housing" matches either "Affordable housing" subject
 * labels or a summary that only mentions "housing."
 */
function expandKeywords(issue: string): string[] {
  const words = issue.split("-").filter(Boolean);
  const combined = words.join(" ");
  const candidates = new Set<string>();
  if (combined) candidates.add(combined);
  for (const word of words) {
    if (word.length >= 4) candidates.add(word);
  }
  return [...candidates];
}

function firstKeywordHit(keywords: readonly string[], text: string | undefined): string | null {
  if (!text) return null;
  const haystack = text.toLowerCase();
  for (const keyword of keywords) {
    if (haystack.includes(keyword)) return keyword;
  }
  return null;
}

function stripHtml(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/<[^>]+>/g, " ").trim();
}

function computeRelevance(matches: readonly StanceMatch[]): number {
  if (matches.length === 0) return 0;
  let total = 0;
  for (const match of matches) {
    total += (match.stanceWeight / 5) * LOCATION_WEIGHT[match.location];
  }
  return Math.min(1, total / Math.max(1, matches.length * 0.75));
}

function computeConfidence(
  bill: Bill,
  stances: readonly IssueStance[],
  matches: readonly StanceMatch[],
): number {
  // With no keyword matches we cannot distinguish "this bill is truly
  // irrelevant to the user's stances" from "our keyword matcher missed
  // something subtle." That ambiguity forces us below the confidence floor so the
  // tool renders "insufficient data" rather than a falsely confident 0%.
  if (matches.length === 0) return 0.2;

  let confidence = 0;

  if (bill.subjects && bill.subjects.length > 0) confidence += 0.15;
  if (bill.summaryText && bill.summaryText.trim().length > 0) confidence += 0.15;
  if (bill.policyArea) confidence += 0.1;

  if (stances.length >= 3) confidence += 0.3;
  else if (stances.length >= 1) confidence += 0.1;

  confidence += 0.1;
  const hasStrongMatch = matches.some(
    (m) => m.location === "policyArea" || m.location === "subject",
  );
  if (hasStrongMatch) confidence += 0.2;

  return Math.min(1, Number(confidence.toFixed(3)));
}

function buildRationale(
  bill: Bill,
  stances: readonly IssueStance[],
  matches: readonly StanceMatch[],
): string {
  if (stances.length === 0) {
    return "No declared issue stances yet — use politiclaw_set_issue_stance before scoring.";
  }
  if (matches.length === 0) {
    return `No declared stance keywords matched this bill's policy area, subjects, title, or summary.`;
  }
  const parts = matches.map((match) => {
    const stanceWord = match.stance === "support" ? "support" : "opposition";
    return `${match.issue} (${stanceWord}, weight ${match.stanceWeight}) matched via ${match.matchedText}`;
  });
  return `Bill ${bill.congress} ${bill.billType} ${bill.number} touches: ${parts.join("; ")}.`;
}

function hashStances(stances: readonly IssueStance[]): string {
  const normalized = [...stances]
    .map((s) => ({ issue: s.issue, stance: s.stance, weight: s.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex").slice(0, 16);
}
