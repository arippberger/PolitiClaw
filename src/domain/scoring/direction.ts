/**
 * Preference-aligned directional framing.
 *
 * Where {@link ./alignment.ts} reports whether a bill *touches* a stance, this
 * module reports whether it appears to *advance* or *obstruct* that stance,
 * always anchored in a quote from the bill's own structured text. No LLM
 * search, no external context — only the bill fields the user can verify by
 * opening the congress.gov link.
 *
 * Audit primitive: any directional claim that cannot be paired with a quote
 * found in the bill text is coerced to `unclear`. Unsourced direction is not
 * permitted to render.
 */
import type { Bill } from "../../sources/bills/types.js";
import type { IssueStance } from "../preferences/types.js";
import { CONFIDENCE_FLOOR } from "./alignment.js";

export type AdvancesObstructs = {
  kind: "advances" | "obstructs";
  confidence: number;
  rationale: string;
  quotedText: string;
  counterConsideration: string;
};

export type MixedDirection = {
  kind: "mixed";
  confidence: number;
  rationale: string;
  advancesQuote: string;
  obstructsQuote: string;
};

export type UnclearDirection = {
  kind: "unclear";
  rationale: string;
};

export type BillDirection = AdvancesObstructs | MixedDirection | UnclearDirection;

export type DirectionForStance = {
  issue: string;
  stance: IssueStance["stance"];
  direction: BillDirection;
};

/**
 * Narrow transport interface so the direction module is not coupled to any
 * specific LLM SDK. Tests inject a fake; production wiring is a later slice.
 */
export type LlmClient = {
  reason(input: {
    system: string;
    user: string;
    responseSchema: unknown;
  }): Promise<unknown>;
};

const DIRECTION_SYSTEM = [
  "You analyze whether a federal bill's text advances or obstructs a user's declared policy stance.",
  "You must ground every directional claim in a literal quote from the bill's own title, policy area, subjects, or summary.",
  "Do not invent text. Do not use outside knowledge.",
  "If the bill's structured text does not support a confident directional claim, return kind=unclear.",
  'Output JSON matching: { kind: "advances"|"obstructs"|"mixed"|"unclear", confidence: number 0..1, rationale: string, quotedText?: string, counterConsideration?: string, advancesQuote?: string, obstructsQuote?: string }.',
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: ["advances", "obstructs", "mixed", "unclear"] },
    confidence: { type: "number" },
    rationale: { type: "string" },
    quotedText: { type: "string" },
    counterConsideration: { type: "string" },
    advancesQuote: { type: "string" },
    obstructsQuote: { type: "string" },
  },
  required: ["kind", "rationale"],
} as const;

type BillTextBundle = {
  title: string;
  policyArea: string;
  subjects: string;
  summary: string;
  haystack: string;
};

export async function computeBillDirection(
  bill: Bill,
  stances: readonly IssueStance[],
  llm: LlmClient,
): Promise<DirectionForStance[]> {
  const active = stances.filter((s) => s.stance !== "neutral");
  if (active.length === 0) return [];

  const billText = buildBillTextBundle(bill);
  const results: DirectionForStance[] = [];

  for (const stance of active) {
    let raw: unknown;
    try {
      raw = await llm.reason({
        system: DIRECTION_SYSTEM,
        user: buildUserPrompt(billText, stance),
        responseSchema: RESPONSE_SCHEMA,
      });
    } catch (err) {
      results.push({
        issue: stance.issue,
        stance: stance.stance,
        direction: {
          kind: "unclear",
          rationale: `direction classifier failed: ${(err as Error).message ?? "unknown error"}`,
        },
      });
      continue;
    }
    const direction = coerceDirection(raw, billText);
    results.push({ issue: stance.issue, stance: stance.stance, direction });
  }

  return results;
}

function buildBillTextBundle(bill: Bill): BillTextBundle {
  const title = bill.title ?? "";
  const policyArea = bill.policyArea ?? "";
  const subjects = (bill.subjects ?? []).join("\n");
  const summary = stripHtml(bill.summaryText) ?? "";
  const haystack = [title, policyArea, subjects, summary]
    .filter((s) => s.length > 0)
    .join("\n")
    .toLowerCase();
  return { title, policyArea, subjects, summary, haystack };
}

function buildUserPrompt(text: BillTextBundle, stance: IssueStance): string {
  return [
    `User stance: ${stance.stance} of "${stance.issue}" (weight ${stance.weight}/5).`,
    "",
    "Bill text (only source of truth — do not use outside knowledge):",
    `TITLE: ${text.title || "(none)"}`,
    `POLICY AREA: ${text.policyArea || "(none)"}`,
    `SUBJECTS:\n${text.subjects || "(none)"}`,
    `SUMMARY:\n${text.summary || "(none)"}`,
    "",
    "Return JSON per the schema. quotedText / advancesQuote / obstructsQuote must be literal substrings of the bill text above.",
  ].join("\n");
}

function coerceDirection(raw: unknown, billText: BillTextBundle): BillDirection {
  if (!raw || typeof raw !== "object") {
    return { kind: "unclear", rationale: "classifier returned a non-object response" };
  }
  const r = raw as Record<string, unknown>;
  const kind = typeof r.kind === "string" ? r.kind : "";
  const rationale = typeof r.rationale === "string" && r.rationale.trim().length > 0
    ? r.rationale.trim()
    : "no rationale provided";
  const confidence = clampConfidence(r.confidence);

  if (kind === "unclear") {
    return { kind: "unclear", rationale };
  }

  if (confidence < CONFIDENCE_FLOOR) {
    return {
      kind: "unclear",
      rationale: `below confidence floor (${confidence.toFixed(2)} < ${CONFIDENCE_FLOOR}): ${rationale}`,
    };
  }

  if (kind === "advances" || kind === "obstructs") {
    const quotedText = typeof r.quotedText === "string" ? r.quotedText.trim() : "";
    const counterConsideration =
      typeof r.counterConsideration === "string" ? r.counterConsideration.trim() : "";

    if (quotedText.length === 0 || !quoteIsGrounded(quotedText, billText)) {
      return {
        kind: "unclear",
        rationale: `direction claim not grounded in bill text: ${rationale}`,
      };
    }

    if (counterConsideration.length === 0) {
      // Coerce single-direction-without-counter into mixed, using the
      // grounded quote as the "advances" side and a stock steel-man prompt
      // as the "obstructs" placeholder. This keeps the dissent discipline
      // intact without inventing text.
      return {
        kind: "mixed",
        confidence,
        rationale: `${rationale} (coerced to mixed — no counter-consideration provided)`,
        advancesQuote: kind === "advances" ? quotedText : "",
        obstructsQuote: kind === "obstructs" ? quotedText : "",
      };
    }

    return {
      kind,
      confidence,
      rationale,
      quotedText,
      counterConsideration,
    };
  }

  if (kind === "mixed") {
    const advancesQuote = typeof r.advancesQuote === "string" ? r.advancesQuote.trim() : "";
    const obstructsQuote = typeof r.obstructsQuote === "string" ? r.obstructsQuote.trim() : "";
    const advancesGrounded = advancesQuote.length > 0 && quoteIsGrounded(advancesQuote, billText);
    const obstructsGrounded =
      obstructsQuote.length > 0 && quoteIsGrounded(obstructsQuote, billText);
    if (!advancesGrounded && !obstructsGrounded) {
      return {
        kind: "unclear",
        rationale: `mixed direction but neither quote grounded in bill text: ${rationale}`,
      };
    }
    return {
      kind: "mixed",
      confidence,
      rationale,
      advancesQuote: advancesGrounded ? advancesQuote : "",
      obstructsQuote: obstructsGrounded ? obstructsQuote : "",
    };
  }

  return { kind: "unclear", rationale: `unknown classifier kind '${kind}'` };
}

function clampConfidence(raw: unknown): number {
  if (typeof raw !== "number" || Number.isNaN(raw)) return 0;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function quoteIsGrounded(quote: string, billText: BillTextBundle): boolean {
  const needle = quote.toLowerCase().trim();
  if (needle.length < 4) return false;
  return billText.haystack.includes(needle);
}

function stripHtml(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
