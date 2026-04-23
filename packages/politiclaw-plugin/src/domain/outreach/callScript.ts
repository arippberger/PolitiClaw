import { createHash } from "node:crypto";

import { getBillDetail, type StoredBill } from "../bills/index.js";
import { listIssueStances, type IssueStanceRow } from "../preferences/index.js";
import { listReps, type StoredRep } from "../reps/index.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { BillRef } from "../../sources/bills/types.js";
import type { PolitiClawDb } from "../../storage/sqlite.js";

export const CALL_SCRIPT_MAX_WORDS = 150;

export const CALL_SCRIPT_DISCLAIMER =
  "This is a draft call. Phone numbers route to the DC office; district offices may answer faster — check the rep's site before you call.";

export type DraftCallScriptInput = {
  repId: string;
  issue: string;
  billId?: string;
  /** Optional single sentence the user wants to say verbatim. */
  oneSpecificSentence?: string;
};

export type DraftCallScriptResult =
  | {
      status: "ok";
      callScriptId: number;
      rep: StoredRep;
      issue: string;
      stance: IssueStanceRow;
      bill?: StoredBill;
      phoneNumber: string | null;
      openingLine: string;
      askLine: string;
      oneSpecificLine: string | null;
      closingLine: string;
      script: string;
      wordCount: number;
      stanceSnapshotHash: string;
    }
  | { status: "rep_not_found"; reason: string; actionable: string }
  | { status: "no_stance_for_issue"; reason: string; actionable: string }
  | { status: "bill_unavailable"; reason: string; actionable?: string }
  | { status: "no_phone_on_file"; reason: string; actionable: string }
  | { status: "over_length"; reason: string; wordCount: number };

export type DraftCallScriptDeps = {
  resolver?: BillsResolver;
  now?: () => number;
};

const BILL_ID_REGEX = /^(\d{2,4})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/i;

export async function draftCallScript(
  db: PolitiClawDb,
  input: DraftCallScriptInput,
  deps: DraftCallScriptDeps = {},
): Promise<DraftCallScriptResult> {
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
        "Run politiclaw_set_issue_stance first — call scripts anchor on your declared position.",
    };
  }
  if (matchedStance.stance === "neutral") {
    return {
      status: "no_stance_for_issue",
      reason: `Declared stance on '${issueSlug}' is neutral.`,
      actionable:
        "Call scripts argue a position. Use politiclaw_set_issue_stance to set support or oppose first.",
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
        actionable:
          "Call the tool without billId, or configure plugins.politiclaw.apiKeys.apiDataGov.",
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

  const phoneNumber = extractRepPhone(rep);
  if (!phoneNumber) {
    const repUrl = extractRepUrl(rep);
    return {
      status: "no_phone_on_file",
      reason: `No phone number stored for ${rep.name}.`,
      actionable: repUrl
        ? `${rep.name}'s official site has the current number: ${repUrl}`
        : "Call politiclaw_get_my_reps to refresh contact info, or check the rep's official site.",
    };
  }

  const openingLine = renderOpening(rep, matchedStance);
  const billLine = bill ? renderBillLine(bill) : null;
  const askLine = renderAskLine(rep, matchedStance, bill);
  const oneSpecific = input.oneSpecificSentence?.trim();
  const oneSpecificLine = oneSpecific && oneSpecific.length > 0 ? oneSpecific : null;
  const closingLine = renderClosing(rep);

  const scriptPieces = [openingLine];
  if (billLine) scriptPieces.push(billLine);
  scriptPieces.push(askLine);
  if (oneSpecificLine) scriptPieces.push(oneSpecificLine);
  scriptPieces.push(closingLine);
  const script = scriptPieces.join(" ");

  const wordCount = countWords(script);
  if (wordCount > CALL_SCRIPT_MAX_WORDS) {
    return {
      status: "over_length",
      reason: `Rendered call script is ${wordCount} words, above the ${CALL_SCRIPT_MAX_WORDS}-word ceiling.`,
      wordCount,
    };
  }

  const stanceSnapshotHash = hashStances(stances);
  const now = deps.now?.() ?? Date.now();
  const callScriptId = persistCallScript(db, {
    rep,
    issue: issueSlug,
    bill,
    openingLine,
    askLine,
    oneSpecificLine,
    closingLine,
    phoneNumber,
    stanceSnapshotHash,
    wordCount,
    createdAt: now,
  });

  return {
    status: "ok",
    callScriptId,
    rep,
    issue: issueSlug,
    stance: matchedStance,
    bill,
    phoneNumber,
    openingLine,
    askLine,
    oneSpecificLine,
    closingLine,
    script,
    wordCount,
    stanceSnapshotHash,
  };
}

function renderOpening(rep: StoredRep, stance: IssueStanceRow): string {
  const district = districtPhrase(rep);
  const issueLabel = issueToSentence(stance.issue);
  return `Hi, my name is [Your name]. I'm ${district} calling about ${issueLabel}.`;
}

function renderBillLine(bill: StoredBill): string {
  const label = `${bill.billType} ${bill.number}`;
  const action = bill.latestActionText ? ` ${bill.latestActionText}` : "";
  return `I'm calling about ${label}.${action}`.trim();
}

function renderAskLine(
  rep: StoredRep,
  stance: IssueStanceRow,
  bill: StoredBill | undefined,
): string {
  const salutation = repSalutation(rep);
  const issueLabel = issueToSentence(stance.issue);
  const target = bill ? `${bill.billType} ${bill.number}` : issueLabel;
  if (stance.stance === "support") {
    return `I'd like to ask ${salutation} to support stronger action on ${target}.`;
  }
  return `I'd like to ask ${salutation} to oppose the current direction on ${target}.`;
}

function renderClosing(rep: StoredRep): string {
  const lastName = rep.name.split(/\s+/).pop() ?? rep.name;
  return `Thank you — please let me know ${lastName}'s position. I can leave my name and ZIP for the record.`;
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

function extractRepPhone(rep: StoredRep): string | null {
  const contact = rep.contact;
  if (!contact || typeof contact !== "object") return null;
  const phone = (contact as Record<string, unknown>).phone;
  if (typeof phone === "string" && phone.trim().length > 0) return phone.trim();
  return null;
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

function persistCallScript(
  db: PolitiClawDb,
  row: {
    rep: StoredRep;
    issue: string;
    bill: StoredBill | undefined;
    openingLine: string;
    askLine: string;
    oneSpecificLine: string | null;
    closingLine: string;
    phoneNumber: string | null;
    stanceSnapshotHash: string;
    wordCount: number;
    createdAt: number;
  },
): number {
  const result = db
    .prepare(
      `INSERT INTO call_scripts (rep_id, rep_name, rep_office, issue, bill_id,
                                 opening_line, ask_line, one_specific_line, closing_line,
                                 phone_number, stance_snapshot_hash, word_count, created_at)
       VALUES (@rep_id, @rep_name, @rep_office, @issue, @bill_id,
               @opening, @ask, @one_specific, @closing,
               @phone, @hash, @wc, @now)`,
    )
    .run({
      rep_id: row.rep.id,
      rep_name: row.rep.name,
      rep_office: row.rep.office,
      issue: row.issue,
      bill_id: row.bill?.id ?? null,
      opening: row.openingLine,
      ask: row.askLine,
      one_specific: row.oneSpecificLine,
      closing: row.closingLine,
      phone: row.phoneNumber,
      hash: row.stanceSnapshotHash,
      wc: row.wordCount,
      now: row.createdAt,
    });
  return Number(result.lastInsertRowid);
}

export type CallScriptListEntry = {
  id: number;
  repId: string;
  repName: string;
  repOffice: string;
  issue: string;
  billId: string | null;
  phoneNumber: string | null;
  wordCount: number;
  createdAt: number;
};

export function listCallScripts(db: PolitiClawDb, limit = 20): CallScriptListEntry[] {
  const rows = db
    .prepare(
      `SELECT id, rep_id, rep_name, rep_office, issue, bill_id, phone_number,
              word_count, created_at
         FROM call_scripts
        ORDER BY created_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: number;
    rep_id: string;
    rep_name: string;
    rep_office: string;
    issue: string;
    bill_id: string | null;
    phone_number: string | null;
    word_count: number;
    created_at: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    repId: r.rep_id,
    repName: r.rep_name,
    repOffice: r.rep_office,
    issue: r.issue,
    billId: r.bill_id,
    phoneNumber: r.phone_number,
    wordCount: r.word_count,
    createdAt: r.created_at,
  }));
}
