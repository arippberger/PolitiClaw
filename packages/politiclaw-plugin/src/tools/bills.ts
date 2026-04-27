import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import { getBillDetail, searchBills, type StoredBill } from "../domain/bills/index.js";
import { createBillsResolver } from "../sources/bills/index.js";
import type { BillRef } from "../sources/bills/types.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DEFAULT_CONGRESS = 119;
const BILL_TYPES = [
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
] as const;

const BILL_ID_REGEX = /^(\d{2,4})-(hr|s|hjres|sjres|hconres|sconres|hres|sres)-(\d+)$/i;

const SearchBillsParams = Type.Object({
  congress: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Congress number. Defaults to the 119th (2025-2027).",
    }),
  ),
  billType: Type.Optional(
    Type.String({
      description: "Bill type (HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES).",
    }),
  ),
  titleContains: Type.Optional(
    Type.String({ description: "Case-insensitive substring match on bill title." }),
  ),
  fromDateTime: Type.Optional(
    Type.String({
      description:
        "ISO-8601 lower bound on bill updateDate. Example: 2026-01-01T00:00:00Z.",
    }),
  ),
  toDateTime: Type.Optional(
    Type.String({ description: "ISO-8601 upper bound on bill updateDate." }),
  ),
  limit: Type.Optional(
    Type.Integer({ minimum: 1, maximum: 50, description: "Max bills to return (1-50)." }),
  ),
  refresh: Type.Optional(
    Type.Boolean({ description: "When true, bypass the cache and re-fetch." }),
  ),
});

const GetBillDetailsParams = Type.Object({
  billId: Type.Optional(
    Type.String({
      description:
        "Canonical bill id: '<congress>-<billType>-<number>', e.g. '119-hr-1234'.",
    }),
  ),
  congress: Type.Optional(Type.Integer({ minimum: 1 })),
  billType: Type.Optional(Type.String()),
  number: Type.Optional(Type.String()),
  refresh: Type.Optional(Type.Boolean()),
});

const SearchBillsInputSchema = z.object({
  congress: z.number().int().positive().optional(),
  billType: z.string().trim().min(1).optional(),
  titleContains: z.string().trim().min(1).optional(),
  fromDateTime: z.string().trim().min(1).optional(),
  toDateTime: z.string().trim().min(1).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  refresh: z.boolean().optional(),
});

const GetBillDetailsInputSchema = z
  .object({
    billId: z.string().trim().min(1).optional(),
    congress: z.number().int().positive().optional(),
    billType: z.string().trim().min(1).optional(),
    number: z.string().trim().min(1).optional(),
    refresh: z.boolean().optional(),
  })
  .refine(
    (input) =>
      Boolean(input.billId) ||
      (input.congress !== undefined && input.billType && input.number),
    { message: "provide billId, or congress + billType + number" },
  );

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

function normalizeBillType(raw: string): string | null {
  const upper = raw.trim().toUpperCase();
  return (BILL_TYPES as readonly string[]).includes(upper) ? upper : null;
}

function parseBillRef(input: {
  billId?: string;
  congress?: number;
  billType?: string;
  number?: string;
}): BillRef | null {
  if (input.billId) {
    const match = BILL_ID_REGEX.exec(input.billId.trim());
    if (!match) return null;
    return {
      congress: Number(match[1]),
      billType: match[2]!.toUpperCase(),
      number: match[3]!,
    };
  }
  if (input.congress !== undefined && input.billType && input.number) {
    const billType = normalizeBillType(input.billType);
    if (!billType) return null;
    return { congress: input.congress, billType, number: input.number };
  }
  return null;
}

function renderBillSummary(bill: StoredBill): string {
  const chamber = bill.originChamber ? ` [${bill.originChamber}]` : "";
  let action = "";
  if (bill.latestActionText) {
    const datePart = bill.latestActionDate ? `${bill.latestActionDate} ` : "";
    action = ` — ${datePart}${bill.latestActionText}`;
  }
  return `- ${bill.congress} ${bill.billType} ${bill.number}${chamber}: ${bill.title}${action}`;
}

export const searchBillsTool: AnyAgentTool = {
  name: "politiclaw_search_bills",
  label: "Search recent federal bills",
  description:
    "List recent federal bills from api.congress.gov (tier 1). Filter by congress, billType, " +
    "updateDate range, and title substring. Requires plugins.politiclaw.apiKeys.apiDataGov. " +
    "Cached for 6h; pass refresh=true to re-fetch.",
  parameters: SearchBillsParams,
  async execute(_toolCallId, rawParams) {
    const parsed = SearchBillsInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(`Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`, {
        status: "invalid",
      });
    }
    const input = parsed.data;

    let billType: string | undefined;
    if (input.billType) {
      const normalized = normalizeBillType(input.billType);
      if (!normalized) {
        return textResult(
          `Unknown billType: ${input.billType}. Expected one of ${BILL_TYPES.join(", ")}.`,
          { status: "invalid" },
        );
      }
      billType = normalized;
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createBillsResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
      scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
    });

    const result = await searchBills(
      db,
      resolver,
      {
        congress: input.congress ?? DEFAULT_CONGRESS,
        billType,
        titleContains: input.titleContains,
        fromDateTime: input.fromDateTime,
        toDateTime: input.toDateTime,
        limit: input.limit,
      },
      { refresh: input.refresh },
    );

    if (result.status === "unavailable") {
      const hint = result.actionable ? ` (${result.actionable})` : "";
      return textResult(`Bills unavailable: ${result.reason}.${hint}`, result);
    }

    if (result.bills.length === 0) {
      return textResult("No bills matched those filters.", result);
    }

    const header = result.fromCache
      ? `Bills (cached from ${result.source.adapterId}, tier ${result.source.tier}):`
      : `Bills (${result.source.adapterId}, tier ${result.source.tier}):`;
    const lines = result.bills.slice(0, input.limit ?? 20).map(renderBillSummary);
    return textResult([header, ...lines].join("\n"), result);
  },
};

export const getBillDetailsTool: AnyAgentTool = {
  name: "politiclaw_get_bill_details",
  label: "Fetch a single federal bill",
  description:
    "Fetch one bill's full detail (sponsors, subjects, summary, latest action) from api.congress.gov (tier 1). " +
    "Accepts either a canonical billId (e.g. '119-hr-1234') or congress + billType + number. " +
    "Requires plugins.politiclaw.apiKeys.apiDataGov.",
  parameters: GetBillDetailsParams,
  async execute(_toolCallId, rawParams) {
    const parsed = GetBillDetailsInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }

    const ref = parseBillRef(parsed.data);
    if (!ref) {
      return textResult(
        "Could not parse bill reference. Use billId like '119-hr-1234' or congress + billType + number.",
        { status: "invalid" },
      );
    }

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createBillsResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
      scraperBaseUrl: cfg.sources?.bills?.scraperBaseUrl,
    });

    const result = await getBillDetail(db, resolver, ref, { refresh: parsed.data.refresh });
    if (result.status === "unavailable") {
      const hint = result.actionable ? ` (${result.actionable})` : "";
      return textResult(`Bill unavailable: ${result.reason}.${hint}`, result);
    }

    const bill = result.bill;
    const header = result.fromCache
      ? `Bill ${bill.congress} ${bill.billType} ${bill.number} (cached from ${result.source.adapterId}, tier ${result.source.tier}):`
      : `Bill ${bill.congress} ${bill.billType} ${bill.number} (${result.source.adapterId}, tier ${result.source.tier}):`;

    const lines: string[] = [header, `Title: ${bill.title}`];
    if (bill.originChamber) lines.push(`Origin chamber: ${bill.originChamber}`);
    if (bill.introducedDate) lines.push(`Introduced: ${bill.introducedDate}`);
    if (bill.policyArea) lines.push(`Policy area: ${bill.policyArea}`);
    if (bill.subjects && bill.subjects.length > 0) {
      lines.push(`Subjects: ${bill.subjects.join(", ")}`);
    }
    if (bill.latestActionText) {
      lines.push(
        `Latest action${bill.latestActionDate ? ` (${bill.latestActionDate})` : ""}: ${bill.latestActionText}`,
      );
    }
    if (bill.sponsors && bill.sponsors.length > 0) {
      lines.push(`Sponsor(s): ${bill.sponsors.map((s) => s.fullName).join("; ")}`);
    }
    if (bill.summaryText) {
      lines.push("", `Summary: ${stripHtml(bill.summaryText)}`);
    }
    if (bill.sourceUrl) lines.push("", `Source: ${bill.sourceUrl}`);

    return textResult(lines.join("\n"), result);
  },
};

function stripHtml(raw: string): string {
  return raw.replace(/<[^>]+>/g, "").trim();
}

export const billsTools: AnyAgentTool[] = [searchBillsTool, getBillDetailsTool];
