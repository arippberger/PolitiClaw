import { Type } from "@sinclair/typebox";
import type { AnyAgentTool } from "openclaw/plugin-sdk";
import { z } from "zod";

import {
  ingestHouseVotes,
  type IngestedVote,
  type IngestHouseVotesResult,
} from "../domain/votes/ingest.js";
import { createHouseVotesResolver } from "../sources/votes/index.js";
import { getPluginConfig, getStorage } from "../storage/context.js";

const DEFAULT_CONGRESS = 119;
const DEFAULT_SESSION = 1;
const DEFAULT_LIMIT = 20;

const IngestHouseVotesParams = Type.Object({
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
      description: "Session within the congress (1 or 2). Defaults to 1.",
    }),
  ),
  limit: Type.Optional(
    Type.Integer({
      minimum: 1,
      maximum: 100,
      description:
        "Max list-level roll-call entries to sweep (1-100). Each listed vote " +
        "may trigger an extra detail+members fetch, so 100 entries can mean " +
        "up to ~200 api.data.gov calls against the 5000/hr quota.",
    }),
  ),
  offset: Type.Optional(Type.Integer({ minimum: 0 })),
  force: Type.Optional(
    Type.Boolean({
      description:
        "When true, re-fetch detail+members for every listed vote even when " +
        "its update_date is unchanged. Use for schema backfills.",
    }),
  ),
});

const IngestHouseVotesInputSchema = z.object({
  congress: z.number().int().positive().optional(),
  session: z.number().int().min(1).max(2).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
  force: z.boolean().optional(),
});

function textResult<T>(text: string, details: T) {
  return { content: [{ type: "text" as const, text }], details };
}

export function renderIngestHouseVotesOutput(
  result: IngestHouseVotesResult,
): string {
  if (result.status === "unavailable") {
    const hint = result.actionable ? ` (${result.actionable})` : "";
    return `House vote ingest unavailable: ${result.reason}.${hint}`;
  }

  if (result.ingested.length === 0) {
    return (
      `No House roll-call votes returned by ${result.source.adapterId} (tier ${result.source.tier}). ` +
      `Try widening the limit or confirming the congress+session are in the endpoint's coverage range.`
    );
  }

  const counts = tallyStatuses(result.ingested);
  const header =
    `House vote ingest (${result.source.adapterId}, tier ${result.source.tier}): ` +
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

export const ingestHouseVotesTool: AnyAgentTool = {
  name: "politiclaw_ingest_house_votes",
  label: "Ingest recent House roll-call votes",
  description:
    "Sweep api.congress.gov's `/house-vote` endpoint and persist recent House roll-call " +
    "votes (plus per-member positions keyed by bioguide id) into the plugin-private DB. " +
    "Idempotent: unchanged entries (by Clerk update_date) skip the detail fetch. " +
    "Requires plugins.politiclaw.apiKeys.apiDataGov. Senate roll-call votes are not yet " +
    "served by api.congress.gov, so this tool currently ingests House only.",
  parameters: IngestHouseVotesParams,
  async execute(_toolCallId, rawParams) {
    const parsed = IngestHouseVotesInputSchema.safeParse(rawParams);
    if (!parsed.success) {
      return textResult(
        `Invalid input: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
        { status: "invalid" },
      );
    }
    const input = parsed.data;

    const { db } = getStorage();
    const cfg = getPluginConfig();
    const resolver = createHouseVotesResolver({
      apiDataGovKey: cfg.apiKeys?.apiDataGov,
    });

    const result = await ingestHouseVotes(db, resolver, {
      filters: {
        congress: input.congress ?? DEFAULT_CONGRESS,
        session: input.session ?? DEFAULT_SESSION,
        limit: input.limit ?? DEFAULT_LIMIT,
        offset: input.offset,
      },
      force: input.force,
    });

    return textResult(renderIngestHouseVotesOutput(result), result);
  },
};

export const voteIngestTools: AnyAgentTool[] = [ingestHouseVotesTool];
