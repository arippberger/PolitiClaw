import { createHash } from "node:crypto";

import { getBillDetail, type StoredBill } from "../bills/index.js";
import { listIssueStances, type IssueStanceRow } from "../preferences/index.js";
import { listReps, type StoredRep } from "../reps/index.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { BillRef } from "../../sources/bills/types.js";
import { congressGovPublicBillUrl } from "../../sources/bills/types.js";
import type { PolitiClawDb } from "../../storage/sqlite.js";

export const LETTER_MAX_WORDS = 400;

export const LETTER_DRAFT_DISCLAIMER =
  "This is a draft. Edit freely before sending — names, details, and tone are yours to own.";

export type DraftLetterInput = {
  repId: string;
  issue: string;
  billId?: string;
  /** Optional user sentence appended verbatim above the closing. */
  customNote?: string;
};

export type LetterCitation = {
  url: string;
  label: string;
  tier: number;
};

export type DraftLetterResult =
  | {
      status: "ok";
      letterId: number;
      rep: StoredRep;
      issue: string;
      stance: IssueStanceRow;
      bill?: StoredBill;
      subject: string;
      body: string;
      citations: LetterCitation[];
      wordCount: number;
      stanceSnapshotHash: string;
    }
  | { status: "rep_not_found"; reason: string; actionable: string }
  | { status: "no_stance_for_issue"; reason: string; actionable: string }
  | { status: "bill_unavailable"; reason: string; actionable?: string }
  | { status: "over_length"; reason: string; wordCount: number };

export type DraftLetterDeps = {
  resolver?: BillsResolver;
  now?: () => number;
};

const BILL_ID_REGEX = /^(\d{2,4})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/i;

export async function draftLetter(
  db: PolitiClawDb,
  input: DraftLetterInput,
  deps: DraftLetterDeps = {},
): Promise<DraftLetterResult> {
  const issueSlug = normalizeIssue(input.issue);
  const repId = input.repId.trim();
  if (!repId) {
    return {
      status: "rep_not_found",
      reason: "repId is empty",
      actionable: "Pass the stable id from politiclaw_get_my_reps.",
    };
  }

  const rep = listReps(db).find((r) => r.id === repId);
  if (!rep) {
    return {
      status: "rep_not_found",
      reason: `No rep found with id '${repId}'.`,
      actionable:
        "Run politiclaw_get_my_reps to see the stable ids of your current reps.",
    };
  }

  const stances = listIssueStances(db);
  const matchedStance = stances.find((s) => s.issue === issueSlug);
  if (!matchedStance) {
    return {
      status: "no_stance_for_issue",
      reason: `No declared stance on issue '${issueSlug}'.`,
      actionable:
        "Run politiclaw_issue_stances with action='set' first — letters anchor on your own declared position.",
    };
  }
  if (matchedStance.stance === "neutral") {
    return {
      status: "no_stance_for_issue",
      reason: `Declared stance on '${issueSlug}' is neutral.`,
      actionable:
        "Letters argue a position. Use politiclaw_issue_stances with action='set' to set support or oppose before drafting.",
    };
  }

  let bill: StoredBill | undefined;
  if (input.billId) {
    const ref = parseBillRef(input.billId);
    if (!ref) {
      return {
        status: "bill_unavailable",
        reason: `Could not parse bill id '${input.billId}'.`,
        actionable: "Use the canonical form '119-hr-1234'.",
      };
    }
    if (!deps.resolver) {
      return {
        status: "bill_unavailable",
        reason:
          "A bill id was supplied but no bills resolver is wired — cannot verify bill details.",
        actionable: "Call the tool without billId, or configure plugins.entries.politiclaw.config.apiKeys.apiDataGov.",
      };
    }
    const detail = await getBillDetail(db, deps.resolver, ref);
    if (detail.status !== "ok") {
      return {
        status: "bill_unavailable",
        reason: detail.reason,
        actionable: detail.actionable,
      };
    }
    bill = detail.bill;
  }

  const stanceSnapshotHash = hashStances(stances);
  const subject = renderSubject(matchedStance, rep, bill);
  const body = renderBody({
    rep,
    stance: matchedStance,
    bill,
    customNote: input.customNote?.trim(),
  });
  const wordCount = countWords(body);
  if (wordCount > LETTER_MAX_WORDS) {
    return {
      status: "over_length",
      reason: `Rendered letter is ${wordCount} words, above the ${LETTER_MAX_WORDS}-word ceiling.`,
      wordCount,
    };
  }

  const citations = buildCitations(rep, bill);
  const now = deps.now?.() ?? Date.now();
  const letterId = persistLetter(db, {
    rep,
    issue: issueSlug,
    bill,
    subject,
    body,
    citations,
    stanceSnapshotHash,
    wordCount,
    createdAt: now,
  });

  return {
    status: "ok",
    letterId,
    rep,
    issue: issueSlug,
    stance: matchedStance,
    bill,
    subject,
    body,
    citations,
    wordCount,
    stanceSnapshotHash,
  };
}

export type LetterListEntry = {
  id: number;
  repId: string;
  repName: string;
  repOffice: string;
  issue: string;
  billId: string | null;
  subject: string;
  wordCount: number;
  createdAt: number;
  redraftRequestedAt: number | null;
};

export function listLetters(db: PolitiClawDb, limit = 20): LetterListEntry[] {
  const rows = db
    .prepare(
      `SELECT id, rep_id, rep_name, rep_office, issue, bill_id, subject,
              word_count, created_at, redraft_requested_at
         FROM letters ORDER BY created_at DESC LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    rep_id: string;
    rep_name: string;
    rep_office: string;
    issue: string;
    bill_id: string | null;
    subject: string;
    word_count: number;
    created_at: number;
    redraft_requested_at: number | null;
  }>;
  return rows.map((r) => ({
    id: r.id,
    repId: r.rep_id,
    repName: r.rep_name,
    repOffice: r.rep_office,
    issue: r.issue,
    billId: r.bill_id,
    subject: r.subject,
    wordCount: r.word_count,
    createdAt: r.created_at,
    redraftRequestedAt: r.redraft_requested_at ?? null,
  }));
}

export type RequestLetterRedraftResult =
  | { status: "ok"; letterId: number; redraftRequestedAt: number }
  | { status: "not_found"; letterId: number };

/**
 * Stamps a letter row with `redraft_requested_at = now`. The agent picks the
 * flag up next time it runs the draft tool for the same rep+issue+bill — the
 * old letter row stays put for audit, and the new draft supersedes it.
 *
 * Idempotent: re-requesting overwrites the timestamp with the latest call,
 * which is what a user pressing the button twice expects.
 */
export function requestLetterRedraft(
  db: PolitiClawDb,
  letterId: number,
  now: number = Date.now(),
): RequestLetterRedraftResult {
  const result = db
    .prepare(
      `UPDATE letters SET redraft_requested_at = ? WHERE id = ?`,
    )
    .run(now, letterId);
  if (result.changes === 0) {
    return { status: "not_found", letterId };
  }
  return { status: "ok", letterId, redraftRequestedAt: now };
}

function normalizeIssue(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "-");
}

function parseBillRef(billId: string): BillRef | null {
  const match = BILL_ID_REGEX.exec(billId.trim());
  if (!match) return null;
  return {
    congress: Number(match[1]),
    billType: match[2]!.toUpperCase(),
    number: match[3]!,
  };
}

function renderSubject(
  stance: IssueStanceRow,
  rep: StoredRep,
  bill: StoredBill | undefined,
): string {
  const issueLabel = issueToSentence(stance.issue);
  const districtTag = rep.state
    ? rep.district
      ? ` (constituent, ${rep.state}-${rep.district})`
      : ` (constituent, ${rep.state})`
    : "";
  if (bill) {
    return `Constituent position on ${bill.billType} ${bill.number} — ${issueLabel}${districtTag}`;
  }
  return `Constituent position on ${issueLabel}${districtTag}`;
}

type BodyContext = {
  rep: StoredRep;
  stance: IssueStanceRow;
  bill: StoredBill | undefined;
  customNote: string | undefined;
};

function renderBody(ctx: BodyContext): string {
  const { rep, stance, bill, customNote } = ctx;
  const salutation = `Dear ${repSalutation(rep)},`;
  const issueLabel = issueToSentence(stance.issue);
  const originFragment = districtPhrase(rep);

  const opening = `I am writing as ${originFragment} to share my position on ${issueLabel}.`;

  const positionLine =
    stance.stance === "support"
      ? `I am writing in support of stronger action on ${issueLabel}, and I am asking you ` +
        "to weigh constituent views from your district when this issue comes before you."
      : `I am writing in opposition to the current direction of policy on ${issueLabel}, and I am asking you ` +
        "to weigh constituent views from your district when this issue comes before you.";

  const stanceNoteParagraph = stance.note && stance.note.trim().length > 0
    ? `Specifically, ${stance.note.trim()}.`
    : null;

  const billParagraph = bill ? renderBillParagraph(bill) : null;

  const askLine = bill
    ? "I would appreciate a direct statement of your position on this bill and the reasoning behind it."
    : "If legislation on this topic comes before you, I would appreciate knowing your position and the reasoning behind it.";

  const customParagraph = customNote && customNote.length > 0 ? customNote : null;

  const closing = [
    "Thank you for your service and for taking the time to hear from constituents.",
    "",
    "Sincerely,",
    "[Your name]",
    "[Your address]",
  ].join("\n");

  const paragraphs: string[] = [
    salutation,
    opening,
    positionLine,
  ];
  if (stanceNoteParagraph) paragraphs.push(stanceNoteParagraph);
  if (billParagraph) paragraphs.push(billParagraph);
  if (customParagraph) paragraphs.push(customParagraph);
  paragraphs.push(askLine);
  paragraphs.push(closing);

  return paragraphs.join("\n\n");
}

function renderBillParagraph(bill: StoredBill): string {
  const publicUrl = congressGovPublicBillUrl(bill.id);
  const header = `${bill.billType} ${bill.number} — ${bill.title}`;
  const lines: string[] = [`The specific bill I am writing about: ${header}.`];
  if (bill.latestActionDate || bill.latestActionText) {
    const date = bill.latestActionDate ? `${bill.latestActionDate}: ` : "";
    const text = bill.latestActionText ?? "Status not reported.";
    lines.push(`Latest action — ${date}${text}`);
  }
  if (publicUrl) {
    lines.push(`Full text and history: ${publicUrl}`);
  }
  return lines.join("\n");
}

function repSalutation(rep: StoredRep): string {
  const lastName = rep.name.split(/\s+/).pop() ?? rep.name;
  if (rep.office === "US Senate") return `Senator ${lastName}`;
  if (rep.office === "US House") return `Representative ${lastName}`;
  return rep.name;
}

function districtPhrase(rep: StoredRep): string {
  if (rep.office === "US House" && rep.state && rep.district) {
    return `a constituent from ${rep.state}-${rep.district}`;
  }
  if (rep.state) return `a constituent from ${rep.state}`;
  return "a constituent";
}

function issueToSentence(issueSlug: string): string {
  return issueSlug.replace(/-/g, " ");
}

function buildCitations(
  rep: StoredRep,
  bill: StoredBill | undefined,
): LetterCitation[] {
  const citations: LetterCitation[] = [];
  const repUrl = extractRepUrl(rep);
  if (repUrl) {
    citations.push({
      url: repUrl,
      label: `${rep.name} — official site`,
      tier: rep.sourceTier,
    });
  }
  if (bill) {
    const billUrl = congressGovPublicBillUrl(bill.id);
    if (billUrl) {
      citations.push({
        url: billUrl,
        label: `${bill.billType} ${bill.number} on congress.gov`,
        tier: bill.sourceTier,
      });
    }
  }
  return citations;
}

function extractRepUrl(rep: StoredRep): string | null {
  const contact = rep.contact;
  if (!contact || typeof contact !== "object") return null;
  const url = (contact as Record<string, unknown>).url;
  return typeof url === "string" && url.length > 0 ? url : null;
}

function countWords(text: string): number {
  return text
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0).length;
}

function hashStances(stances: readonly IssueStanceRow[]): string {
  const canonical = [...stances]
    .map((s) => ({ issue: s.issue, stance: s.stance, weight: s.weight }))
    .sort((a, b) => a.issue.localeCompare(b.issue));
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex");
}

function persistLetter(
  db: PolitiClawDb,
  row: {
    rep: StoredRep;
    issue: string;
    bill: StoredBill | undefined;
    subject: string;
    body: string;
    citations: LetterCitation[];
    stanceSnapshotHash: string;
    wordCount: number;
    createdAt: number;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO letters (rep_id, rep_name, rep_office, issue, bill_id, subject, body,
                            citations_json, stance_snapshot_hash, word_count, created_at)
       VALUES (@rep_id, @rep_name, @rep_office, @issue, @bill_id, @subject, @body,
               @citations_json, @stance_snapshot_hash, @word_count, @created_at)`,
    )
    .run({
      rep_id: row.rep.id,
      rep_name: row.rep.name,
      rep_office: row.rep.office,
      issue: row.issue,
      bill_id: row.bill?.id ?? null,
      subject: row.subject,
      body: row.body,
      citations_json: JSON.stringify(row.citations),
      stance_snapshot_hash: row.stanceSnapshotHash,
      word_count: row.wordCount,
      created_at: row.createdAt,
    });
  return Number(result.lastInsertRowid);
}
