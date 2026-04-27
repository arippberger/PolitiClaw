import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk/plugin-entry";
import { z } from "zod";

import {
  ingestVotes,
  type IngestedVote,
  type IngestVotesResult,
} from "../domain/votes/ingest.js";
import { createVotesResolver } from "../sources/votes/index.js";
import type { VoteChamber } from "../sources/votes/types.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DEFAULT_CONGRESS = 119;
const DEFAULT_LIMIT = 20;
const DEFAULT_CHAMBER: ChamberArg = "Both";

type ChamberArg = "House" | "Senate" | "Both";

const IngestVotesParams = Type.Object({
  chamber: Type.Optional(
    Type.Union(
      [
        Type.Literal("House"),
        Type.Literal("Senate"),
        Type.Literal("Both"),
      ],
      {
        description:
          "Which chamber to sweep. Defaults to 'Both'. House uses api.congress.gov (tier 1); Senate uses voteview.com (tier 2).",
      },
    ),
  ),
  congress: Type.Optional(
    Type.Integer({
      minimum: 1,
      description: "Congress number. Defaults to the 119th (2025-2027).",
    }),
  ),
  session: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 2,
      description: "Session within the congress (1 or 2). If omitted, no session filter is applied — the most recent votes across both sessions are returned.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description:
        "Max list-level roll-call entries to sweep per chamber (1-100). House ingest may trigger an extra detail+members fetch per vote against the api.data.gov 5000/hr quota. Senate ingest fetches the full /api/search response once then issues one /api/download per vote.",
    }),
  ),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  force: Type.Optional(
    Type.Boolean({
      description:
        "When true, re-fetch detail+members for every listed vote even when its update_date is unchanged. Use for schema backfills or to pick up Voteview corrections (Voteview does not expose an update timestamp).",
    }),
  ),
});

const IngestVotesInputSchema = z.object({
  chamber: z.enum(["House", "Senate", "Both"]).optional(),
  congress: z.number().int().positive().optional(),
  session: z.number().int().min(1).max(2).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  force: z.boolean().optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export type CombinedIngestResult = {
  byChamber: Array<{
    chamber: VoteChamber;
    result: IngestVotesResult;
  }>;
};

export function renderIngestVotesOutput(combined: CombinedIngestResult): string {
  const blocks: string[] = [];
  for (const entry of combined.byChamber) {
    blocks.push(renderChamberBlock(entry.chamber, entry.result));
  }
  return blocks.join("\n\n");
}

function renderChamberBlock(
  chamber: VoteChamber,
  result: IngestVotesResult,
): string {
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` (${result.actionable})` : "";
    return `${chamber} vote ingest unavailable: ${result.reason}.${hint}`;
  }

  if (result.ingested.length === 0) {
    return (
      `No ${chamber} roll-call votes returned by ${result.source.adapterId} (tier ${result.source.tier}). ` +
      `Try widening the limit or confirming the congress+session are in the endpoint's coverage range.`
    );
  }

  const counts = tallyStatuses(result.ingested);
  const header =
    `${chamber} vote ingest (${result.source.adapterId}, tier ${result.source.tier}): ` +
    `${counts.new} new · ${counts.updated} updated · ${counts.unchanged} unchanged` +
    (counts.skipped > 0 ? ` · ${counts.skipped} skipped (detail unavailable)` : "");

  const lines = result.ingested.map(renderIngestedVote);

  const footer = counts.skipped
    ? "Skipped rows keep their previously-ingested data; re-run to retry."
    : null;

  return [header, ...lines, ...(footer ? ["", footer] : [])].join("\n");
}

function renderIngestedVote(ingested: IngestedVote): string {
  const marker = `[${ingested.status}]`;
  const bill = ingested.billId ? ` bill=${ingested.billId}` : "";
  const members =
    ingested.memberCount > 0 ? ` members=${ingested.memberCount}` : "";
  const reason =
    ingested.status === "skipped_unavailable" && ingested.reason
      ? ` — ${ingested.reason}`
      : "";
  return `- ${marker} ${ingested.id} (roll ${ingested.rollCallNumber})${bill}${members}${reason}`;
}

function tallyStatuses(ingested: readonly IngestedVote[]) {
  const counts = { new: 0, updated: 0, unchanged: 0, skipped: 0 };
  for (const entry of ingested) {
    if (entry.status === "new") counts.new += 1;
    else if (entry.status === "updated") counts.updated += 1;
    else if (entry.status === "unchanged") counts.unchanged += 1;
    else counts.skipped += 1;
  }
  return counts;
}

function chambersFor(input: ChamberArg): VoteChamber[] {
  if (input === "House") return ["House"];
  if (input === "Senate") return ["Senate"];
  return ["House", "Senate"];
}

export const ingestVotesTool: AnyAgentTool = {
  name: "politiclaw_ingest_votes",
  label: "Ingest recent congressional roll-call votes",
  description:
    "Sweep primary roll-call sources and persist recent votes (plus per-member positions keyed by bioguide id) into the plugin-private DB. House: api.congress.gov `/house-vote` (tier 1, requires plugins.politiclaw.apiKeys.apiDataGov). Senate: voteview.com `/api/search` + `/api/download` (tier 2, zero-key). Idempotent: unchanged entries (by update_date when available, by memberCount>0 otherwise) skip the detail fetch. Use chamber='Both' (default) to ingest both chambers in one call.",
  parameters: IngestVotesParams,
  async execute(_toolCallId, rawParams) {
    const parsed = IngestVotesInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }
    const input = parsed.data;

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createVotesResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
    });

    const chambers = chambersFor(input.chamber ?? DEFAULT_CHAMBER);
    const byChamber: CombinedIngestResult["byChamber"] = [];
    for (const chamber of chambers) {
      const result = await ingestVotes(db, resolver, {
        filters: {
          congress: input.congress ?? DEFAULT_CONGRESS,
          chamber,
          session: input.session,
          limit: input.limit ?? DEFAULT_LIMIT,
          offset: input.offset,
        },
        force: input.force,
      });
      byChamber.push({ chamber, result });
    }

    const combined: CombinedIngestResult = { byChamber };
    return textResult(renderIngestVotesOutput(combined), combined);
  },
};

export const voteIngestTools: AnyAgentTool[] = [ingestVotesTool];
