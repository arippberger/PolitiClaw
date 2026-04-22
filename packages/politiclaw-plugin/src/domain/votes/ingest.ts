import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { HouseVotesResolver } from "../../sources/votes/index.js";
import type {
  MemberVote,
  RollCallVote,
  RollCallVoteListFilters,
} from "../../sources/votes/types.js";

/**
 * Outcome of ingesting a single roll-call vote.
 *
 * - `"new"`    — row did not exist; detail+members fetched and persisted.
 * - `"updated"`— row existed but its `update_date` (or question/procedural flag)
 *                drifted; detail+members re-fetched and rewritten.
 * - `"unchanged"` — row already up-to-date; no detail fetch performed.
 * - `"skipped_unavailable"` — we know about the list entry but detail/members
 *                             was unavailable this run. The row is left in its
 *                             previous state so representative scoring still
 *                             sees whatever we last ingested for it.
 */
export type IngestVoteStatus =
  | "new"
  | "updated"
  | "unchanged"
  | "skipped_unavailable";

export type IngestedVote = {
  id: string;
  status: IngestVoteStatus;
  billId?: string;
  rollCallNumber: number;
  /** Member rows successfully persisted on this run. Zero when `status` is "unchanged" / "skipped_unavailable". */
  memberCount: number;
  /** Populated when `status === "skipped_unavailable"`. */
  reason?: string;
};

export type IngestHouseVotesResult =
  | {
      status: "ok";
      ingested: IngestedVote[];
      source: { adapterId: string; tier: number };
    }
  | { status: "unavailable"; reason: string; actionable?: string };

export type IngestHouseVotesOptions = {
  filters: RollCallVoteListFilters;
  /** When true, re-fetch detail+members for every listed vote even if its update_date is unchanged. */
  force?: boolean;
};

/**
 * Ingest recent House roll-call votes into the plugin-private DB.
 *
 * Strategy (no `snapshots`-table involvement — vote rows are tier-1 authoritative
 * data, not user-facing alerts):
 *
 *  1. Pull the list slice for (congress, session) via the resolver.
 *  2. For every listed vote, look up the existing row. If the list-level
 *     `updateDate` matches what we already have persisted AND we already
 *     have at least one member row for it, skip detail fetch — the Clerk
 *     has not touched the record since our last ingest.
 *  3. Otherwise, fetch `getWithMembers()` in sequence (api.data.gov 5000/hr
 *     limit is comfortable for batched single-user loads, but parallelizing
 *     this would need a rate-limit shield that the current ingest path does
 *     not implement).
 *  4. Upsert the vote row, replace the member rows atomically.
 *
 * There is no LLM-search fallback at any layer here; a missing primary
 * surfaces as `status: "unavailable"` and representative scoring treats that
 * as "insufficient data" for any rep whose positions we cannot resolve.
 */
export async function ingestHouseVotes(
  db: PolitiClawDb,
  resolver: HouseVotesResolver,
  options: IngestHouseVotesOptions,
): Promise<IngestHouseVotesResult> {
  const listResult = await resolver.list(options.filters);
  if (listResult.status !== "ok") {
    return {
      status: "unavailable",
      reason: listResult.reason,
      actionable: listResult.actionable,
    };
  }

  const ingested: IngestedVote[] = [];
  for (const listVote of listResult.data) {
    const existing = readExistingVote(db, listVote.id);
    const needsRefresh =
      options.force ||
      !existing ||
      existing.updateDate !== (listVote.updateDate ?? null) ||
      existing.memberCount === 0;

    if (!needsRefresh) {
      ingested.push({
        id: listVote.id,
        status: "unchanged",
        billId: listVote.billId,
        rollCallNumber: listVote.rollCallNumber,
        memberCount: existing!.memberCount,
      });
      continue;
    }

    const detailResult = await resolver.getWithMembers({
      chamber: listVote.chamber,
      congress: listVote.congress,
      session: listVote.session,
      rollCallNumber: listVote.rollCallNumber,
    });

    if (detailResult.status !== "ok") {
      ingested.push({
        id: listVote.id,
        status: "skipped_unavailable",
        billId: listVote.billId,
        rollCallNumber: listVote.rollCallNumber,
        memberCount: existing?.memberCount ?? 0,
        reason: detailResult.reason,
      });
      continue;
    }

    const { vote, members } = detailResult.data;
    const merged = mergeVote(listVote, vote);
    persistVoteAndMembers(
      db,
      merged,
      members,
      detailResult.adapterId,
      detailResult.tier,
      detailResult.fetchedAt,
    );

    ingested.push({
      id: merged.id,
      status: existing ? "updated" : "new",
      billId: merged.billId,
      rollCallNumber: merged.rollCallNumber,
      memberCount: members.length,
    });
  }

  return {
    status: "ok",
    ingested,
    source: { adapterId: listResult.adapterId, tier: listResult.tier },
  };
}

type ExistingVoteRow = {
  updateDate: string | null;
  memberCount: number;
};

function readExistingVote(db: PolitiClawDb, id: string): ExistingVoteRow | null {
  const row = db
    .prepare(
      `SELECT rcv.update_date AS update_date,
              (SELECT COUNT(*) FROM member_votes mv WHERE mv.vote_id = rcv.id) AS member_count
         FROM roll_call_votes rcv
         WHERE rcv.id = @id`,
    )
    .get({ id }) as { update_date: string | null; member_count: number } | undefined;
  if (!row) return null;
  return { updateDate: row.update_date, memberCount: row.member_count };
}

/**
 * The detail payload is authoritative for `voteQuestion` / `isProcedural`, but
 * api.congress.gov has been observed to drop echoed list-level fields on
 * detail responses. Merge list + detail so the persisted row carries the
 * superset — caller never has to worry about which endpoint surfaced which.
 */
function mergeVote(listVote: RollCallVote, detailVote: RollCallVote): RollCallVote {
  return {
    ...listVote,
    ...detailVote,
    // Preserve list-level `startDate` / `updateDate` when detail omits them,
    // since change detection keys on these.
    startDate: detailVote.startDate ?? listVote.startDate,
    updateDate: detailVote.updateDate ?? listVote.updateDate,
    voteType: detailVote.voteType ?? listVote.voteType,
    result: detailVote.result ?? listVote.result,
    billId: detailVote.billId ?? listVote.billId,
    amendmentId: detailVote.amendmentId ?? listVote.amendmentId,
    amendmentAuthor: detailVote.amendmentAuthor ?? listVote.amendmentAuthor,
    legislationUrl: detailVote.legislationUrl ?? listVote.legislationUrl,
    sourceUrl: detailVote.sourceUrl ?? listVote.sourceUrl,
  };
}

function persistVoteAndMembers(
  db: PolitiClawDb,
  vote: RollCallVote,
  members: MemberVote[],
  adapterId: string,
  tier: number,
  fetchedAt: number,
): void {
  const upsertVote = db.prepare(
    `INSERT INTO roll_call_votes
       (id, chamber, congress, session, roll_call_number,
        start_date, update_date, vote_type, result, vote_question,
        bill_id, amendment_id, amendment_author, legislation_url, source_url,
        is_procedural, source_adapter_id, source_tier, synced_at)
     VALUES
       (@id, @chamber, @congress, @session, @roll_call_number,
        @start_date, @update_date, @vote_type, @result, @vote_question,
        @bill_id, @amendment_id, @amendment_author, @legislation_url, @source_url,
        @is_procedural, @source_adapter_id, @source_tier, @synced_at)
     ON CONFLICT(id) DO UPDATE SET
       chamber           = excluded.chamber,
       congress          = excluded.congress,
       session           = excluded.session,
       roll_call_number  = excluded.roll_call_number,
       start_date        = excluded.start_date,
       update_date       = excluded.update_date,
       vote_type         = excluded.vote_type,
       result            = excluded.result,
       vote_question     = excluded.vote_question,
       bill_id           = excluded.bill_id,
       amendment_id      = excluded.amendment_id,
       amendment_author  = excluded.amendment_author,
       legislation_url   = excluded.legislation_url,
       source_url        = excluded.source_url,
       is_procedural     = excluded.is_procedural,
       source_adapter_id = excluded.source_adapter_id,
       source_tier       = excluded.source_tier,
       synced_at         = excluded.synced_at`,
  );

  const deleteMembers = db.prepare(
    `DELETE FROM member_votes WHERE vote_id = @vote_id`,
  );
  const insertMember = db.prepare(
    `INSERT INTO member_votes
       (vote_id, bioguide_id, position, first_name, last_name, party, state)
     VALUES
       (@vote_id, @bioguide_id, @position, @first_name, @last_name, @party, @state)`,
  );

  db.transaction(() => {
    upsertVote.run({
      id: vote.id,
      chamber: vote.chamber,
      congress: vote.congress,
      session: vote.session,
      roll_call_number: vote.rollCallNumber,
      start_date: vote.startDate ?? null,
      update_date: vote.updateDate ?? null,
      vote_type: vote.voteType ?? null,
      result: vote.result ?? null,
      vote_question: vote.voteQuestion ?? null,
      bill_id: vote.billId ?? null,
      amendment_id: vote.amendmentId ?? null,
      amendment_author: vote.amendmentAuthor ?? null,
      legislation_url: vote.legislationUrl ?? null,
      source_url: vote.sourceUrl ?? null,
      is_procedural:
        vote.isProcedural === undefined ? null : vote.isProcedural ? 1 : 0,
      source_adapter_id: adapterId,
      source_tier: tier,
      synced_at: fetchedAt,
    });
    deleteMembers.run({ vote_id: vote.id });
    for (const member of members) {
      insertMember.run({
        vote_id: vote.id,
        bioguide_id: member.bioguideId,
        position: member.position,
        first_name: member.firstName ?? null,
        last_name: member.lastName ?? null,
        party: member.party ?? null,
        state: member.state ?? null,
      });
    }
  })();
}

export type StoredRollCallVote = RollCallVote & {
  sourceAdapterId: string;
  sourceTier: number;
  syncedAt: number;
};

/** List stored roll-call votes. Used by representative scoring and the tool surface. */
export function listStoredVotes(
  db: PolitiClawDb,
  filters: { bioguideId?: string; billId?: string; excludeProcedural?: boolean } = {},
): StoredRollCallVote[] {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.bioguideId) {
    where.push(
      `EXISTS (SELECT 1 FROM member_votes mv WHERE mv.vote_id = rcv.id AND mv.bioguide_id = @bioguide)`,
    );
    params.bioguide = filters.bioguideId;
  }
  if (filters.billId) {
    where.push(`rcv.bill_id = @bill`);
    params.bill = filters.billId;
  }
  if (filters.excludeProcedural) {
    // NULL means "unknown" — exclude those too so we do not infer
    // substantive alignment from rows we cannot classify.
    where.push(`rcv.is_procedural = 0`);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";

  const rows = db
    .prepare(
      `SELECT id, chamber, congress, session, roll_call_number,
              start_date, update_date, vote_type, result, vote_question,
              bill_id, amendment_id, amendment_author, legislation_url,
              source_url, is_procedural,
              source_adapter_id, source_tier, synced_at
         FROM roll_call_votes rcv
         ${whereClause}
         ORDER BY start_date DESC`,
    )
    .all(params) as Array<{
    id: string;
    chamber: string;
    congress: number;
    session: number;
    roll_call_number: number;
    start_date: string | null;
    update_date: string | null;
    vote_type: string | null;
    result: string | null;
    vote_question: string | null;
    bill_id: string | null;
    amendment_id: string | null;
    amendment_author: string | null;
    legislation_url: string | null;
    source_url: string | null;
    is_procedural: number | null;
    source_adapter_id: string;
    source_tier: number;
    synced_at: number;
  }>;

  return rows.map((row) => ({
    id: row.id,
    chamber: row.chamber as RollCallVote["chamber"],
    congress: row.congress,
    session: row.session,
    rollCallNumber: row.roll_call_number,
    startDate: row.start_date ?? undefined,
    updateDate: row.update_date ?? undefined,
    voteType: row.vote_type ?? undefined,
    result: row.result ?? undefined,
    voteQuestion: row.vote_question ?? undefined,
    billId: row.bill_id ?? undefined,
    amendmentId: row.amendment_id ?? undefined,
    amendmentAuthor: row.amendment_author ?? undefined,
    legislationUrl: row.legislation_url ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    isProcedural:
      row.is_procedural === null ? undefined : row.is_procedural === 1,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
    syncedAt: row.synced_at,
  }));
}

export type RecentBillVote = {
  voteId: string;
  billId: string;
  billTitle: string | null;
  chamber: "House" | "Senate";
  result: string | null;
  voteQuestion: string | null;
  startDate: string | null;
};

/**
 * Recent roll-call votes that reference a bill, joined to `bills.title` when
 * we have it. Used by the dashboard quick-vote UI: each entry becomes a
 * "would you have voted yes/no/skip on this bill?" prompt that records a
 * `stance_signals` row.
 *
 * Excludes votes with NULL bill_id (procedural motions, motions to recommit,
 * etc) — those have no clean stance to express.
 */
export function listRecentBillVotes(
  db: PolitiClawDb,
  limit = 10,
): RecentBillVote[] {
  const rows = db
    .prepare(
      `SELECT rcv.id           AS vote_id,
              rcv.bill_id      AS bill_id,
              b.title          AS bill_title,
              rcv.chamber      AS chamber,
              rcv.result       AS result,
              rcv.vote_question AS vote_question,
              rcv.start_date   AS start_date
         FROM roll_call_votes rcv
         LEFT JOIN bills b ON b.id = rcv.bill_id
         WHERE rcv.bill_id IS NOT NULL
         ORDER BY rcv.start_date DESC, rcv.id DESC
         LIMIT ?`,
    )
    .all(limit) as Array<{
    vote_id: string;
    bill_id: string;
    bill_title: string | null;
    chamber: string;
    result: string | null;
    vote_question: string | null;
    start_date: string | null;
  }>;
  return rows.map((row) => ({
    voteId: row.vote_id,
    billId: row.bill_id,
    billTitle: row.bill_title ?? null,
    chamber: row.chamber as "House" | "Senate",
    result: row.result ?? null,
    voteQuestion: row.vote_question ?? null,
    startDate: row.start_date ?? null,
  }));
}

export type StoredMemberVote = MemberVote;

export function listMemberVotes(
  db: PolitiClawDb,
  voteId: string,
): StoredMemberVote[] {
  const rows = db
    .prepare(
      `SELECT vote_id, bioguide_id, position, first_name, last_name, party, state
         FROM member_votes
         WHERE vote_id = @vote_id
         ORDER BY last_name, first_name`,
    )
    .all({ vote_id: voteId }) as Array<{
    vote_id: string;
    bioguide_id: string;
    position: string;
    first_name: string | null;
    last_name: string | null;
    party: string | null;
    state: string | null;
  }>;
  return rows.map((row) => ({
    voteId: row.vote_id,
    bioguideId: row.bioguide_id,
    position: row.position as MemberVote["position"],
    firstName: row.first_name ?? undefined,
    lastName: row.last_name ?? undefined,
    party: row.party ?? undefined,
    state: row.state ?? undefined,
  }));
}
