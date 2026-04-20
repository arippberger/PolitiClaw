import type { PolitiClawDb } from "../../storage/sqlite.js";
import type { BillsResolver } from "../../sources/bills/index.js";
import type { Bill, BillListFilters, BillRef } from "../../sources/bills/types.js";

export type StoredBill = Bill & {
  lastSynced: number;
  sourceAdapterId: string;
  sourceTier: number;
};

export type Provenance = { adapterId: string; tier: number };

export type SearchResult =
  | {
      status: "ok";
      bills: StoredBill[];
      fromCache: boolean;
      source: Provenance;
    }
  | { status: "unavailable"; reason: string; actionable?: string };

export type DetailResult =
  | { status: "ok"; bill: StoredBill; fromCache: boolean; source: Provenance }
  | { status: "unavailable"; reason: string; actionable?: string };

export type SearchOptions = {
  refresh?: boolean;
  /** Max age of cached rows considered fresh. Defaults to 6h for active lists. */
  maxAgeMs?: number;
};

const DEFAULT_LIST_MAX_AGE_MS = 6 * 60 * 60 * 1000;
const DEFAULT_DETAIL_MAX_AGE_MS = 60 * 60 * 1000;

export async function searchBills(
  db: PolitiClawDb,
  resolver: BillsResolver,
  filters: BillListFilters,
  opts: SearchOptions = {},
): Promise<SearchResult> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_LIST_MAX_AGE_MS;
  if (!opts.refresh) {
    const cached = listCachedBills(db, filters);
    if (cached.length > 0 && cached.every((row) => Date.now() - row.lastSynced < maxAge)) {
      const first = cached[0]!;
      return {
        status: "ok",
        bills: cached,
        fromCache: true,
        source: { adapterId: first.sourceAdapterId, tier: first.sourceTier },
      };
    }
  }

  const result = await resolver.list(filters);
  if (result.status !== "ok") {
    return { status: "unavailable", reason: result.reason, actionable: result.actionable };
  }

  persistBills(db, result.data, result.adapterId, result.tier, result.fetchedAt);
  return {
    status: "ok",
    bills: listCachedBills(db, filters),
    fromCache: false,
    source: { adapterId: result.adapterId, tier: result.tier },
  };
}

export type DetailOptions = { refresh?: boolean; maxAgeMs?: number };

export async function getBillDetail(
  db: PolitiClawDb,
  resolver: BillsResolver,
  ref: BillRef,
  opts: DetailOptions = {},
): Promise<DetailResult> {
  const maxAge = opts.maxAgeMs ?? DEFAULT_DETAIL_MAX_AGE_MS;
  if (!opts.refresh) {
    const cached = readCachedBill(db, ref);
    // Only treat a cached row as a detail hit when it has detail-only fields.
    if (cached && Date.now() - cached.lastSynced < maxAge && hasDetail(cached)) {
      return {
        status: "ok",
        bill: cached,
        fromCache: true,
        source: { adapterId: cached.sourceAdapterId, tier: cached.sourceTier },
      };
    }
  }

  const result = await resolver.get(ref);
  if (result.status !== "ok") {
    return { status: "unavailable", reason: result.reason, actionable: result.actionable };
  }

  persistBills(db, [result.data], result.adapterId, result.tier, result.fetchedAt);
  const stored = readCachedBill(db, ref);
  if (!stored) {
    return { status: "unavailable", reason: "internal persistence error" };
  }
  return {
    status: "ok",
    bill: stored,
    fromCache: false,
    source: { adapterId: result.adapterId, tier: result.tier },
  };
}

function hasDetail(bill: StoredBill): boolean {
  return Boolean(bill.summaryText || (bill.subjects && bill.subjects.length > 0) || bill.sponsors);
}

export function listCachedBills(db: PolitiClawDb, filters: BillListFilters): StoredBill[] {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filters.congress !== undefined) {
    clauses.push("congress = @congress");
    params.congress = filters.congress;
  }
  if (filters.billType) {
    clauses.push("bill_type = @bill_type");
    params.bill_type = filters.billType.toUpperCase();
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  const rows = db
    .prepare(
      `SELECT id, congress, bill_type, number, title, origin_chamber, introduced_date,
              latest_action_date, latest_action_text, policy_area, subjects_json,
              summary_text, sponsors_json, update_date, source_url,
              last_synced, source_adapter_id, source_tier
         FROM bills ${where}
         ORDER BY latest_action_date DESC, update_date DESC`,
    )
    .all(params) as BillRow[];

  const bills = rows.map(rowToStoredBill);
  return filters.titleContains
    ? bills.filter((bill) => bill.title.toLowerCase().includes(filters.titleContains!.toLowerCase()))
    : bills;
}

function readCachedBill(db: PolitiClawDb, ref: BillRef): StoredBill | null {
  const id = `${ref.congress}-${ref.billType.toLowerCase()}-${ref.number}`;
  const row = db
    .prepare(
      `SELECT id, congress, bill_type, number, title, origin_chamber, introduced_date,
              latest_action_date, latest_action_text, policy_area, subjects_json,
              summary_text, sponsors_json, update_date, source_url,
              last_synced, source_adapter_id, source_tier
         FROM bills WHERE id = @id`,
    )
    .get({ id }) as BillRow | undefined;
  return row ? rowToStoredBill(row) : null;
}

type BillRow = {
  id: string;
  congress: number;
  bill_type: string;
  number: string;
  title: string;
  origin_chamber: string | null;
  introduced_date: string | null;
  latest_action_date: string | null;
  latest_action_text: string | null;
  policy_area: string | null;
  subjects_json: string | null;
  summary_text: string | null;
  sponsors_json: string | null;
  update_date: string | null;
  source_url: string | null;
  last_synced: number;
  source_adapter_id: string;
  source_tier: number;
};

function rowToStoredBill(row: BillRow): StoredBill {
  return {
    id: row.id,
    congress: row.congress,
    billType: row.bill_type,
    number: row.number,
    title: row.title,
    originChamber: (row.origin_chamber as StoredBill["originChamber"]) ?? undefined,
    introducedDate: row.introduced_date ?? undefined,
    latestActionDate: row.latest_action_date ?? undefined,
    latestActionText: row.latest_action_text ?? undefined,
    policyArea: row.policy_area ?? undefined,
    subjects: row.subjects_json ? (JSON.parse(row.subjects_json) as string[]) : undefined,
    summaryText: row.summary_text ?? undefined,
    sponsors: row.sponsors_json
      ? (JSON.parse(row.sponsors_json) as StoredBill["sponsors"])
      : undefined,
    updateDate: row.update_date ?? undefined,
    sourceUrl: row.source_url ?? undefined,
    lastSynced: row.last_synced,
    sourceAdapterId: row.source_adapter_id,
    sourceTier: row.source_tier,
  };
}

function persistBills(
  db: PolitiClawDb,
  bills: Bill[],
  adapterId: string,
  tier: number,
  fetchedAt: number,
): void {
  const upsert = db.prepare(
    `INSERT INTO bills (id, congress, bill_type, number, title, origin_chamber,
                        introduced_date, latest_action_date, latest_action_text,
                        policy_area, subjects_json, summary_text, sponsors_json,
                        update_date, source_url, last_synced, source_adapter_id,
                        source_tier, raw)
     VALUES (@id, @congress, @bill_type, @number, @title, @origin_chamber,
             @introduced_date, @latest_action_date, @latest_action_text,
             @policy_area, @subjects_json, @summary_text, @sponsors_json,
             @update_date, @source_url, @last_synced, @source_adapter_id,
             @source_tier, @raw)
     ON CONFLICT(id) DO UPDATE SET
       title              = excluded.title,
       origin_chamber     = excluded.origin_chamber,
       introduced_date    = COALESCE(excluded.introduced_date, bills.introduced_date),
       latest_action_date = excluded.latest_action_date,
       latest_action_text = excluded.latest_action_text,
       policy_area        = COALESCE(excluded.policy_area, bills.policy_area),
       subjects_json      = COALESCE(excluded.subjects_json, bills.subjects_json),
       summary_text       = COALESCE(excluded.summary_text, bills.summary_text),
       sponsors_json      = COALESCE(excluded.sponsors_json, bills.sponsors_json),
       update_date        = excluded.update_date,
       source_url         = COALESCE(excluded.source_url, bills.source_url),
       last_synced        = excluded.last_synced,
       source_adapter_id  = excluded.source_adapter_id,
       source_tier        = excluded.source_tier,
       raw                = excluded.raw`,
  );

  db.transaction(() => {
    for (const bill of bills) {
      upsert.run({
        id: bill.id,
        congress: bill.congress,
        bill_type: bill.billType.toUpperCase(),
        number: bill.number,
        title: bill.title,
        origin_chamber: bill.originChamber ?? null,
        introduced_date: bill.introducedDate ?? null,
        latest_action_date: bill.latestActionDate ?? null,
        latest_action_text: bill.latestActionText ?? null,
        policy_area: bill.policyArea ?? null,
        subjects_json: bill.subjects ? JSON.stringify(bill.subjects) : null,
        summary_text: bill.summaryText ?? null,
        sponsors_json: bill.sponsors ? JSON.stringify(bill.sponsors) : null,
        update_date: bill.updateDate ?? null,
        source_url: bill.sourceUrl ?? null,
        last_synced: fetchedAt,
        source_adapter_id: adapterId,
        source_tier: tier,
        raw: JSON.stringify(bill),
      });
    }
  })();
}
