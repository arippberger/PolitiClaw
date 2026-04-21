-- Indexes covering the two hot query paths exercised by rep scoring on every
-- run.
--
-- 1. bill_alignment_stance_snapshot — the coverage queries in
--    computeCoverage() filter on stance_snapshot_hash alone. The table's PK is
--    (bill_id, stance_snapshot_hash), so bill_id is the leading column and
--    hash-only filters do not use the PK index. Without this index, each rep
--    score does a full table scan of bill_alignment.
--
-- 2. stance_signals_bill_dir_created — readEvidenceRows() filters on
--    `bill_id IS NOT NULL AND direction IN ('agree','disagree')` and orders
--    on `created_at DESC, id DESC` inside a window function. The existing
--    stance_signals_bill index covers bill_id alone but forces a sort step
--    for the window's ORDER BY; the composite covers the filter + sort.

CREATE INDEX IF NOT EXISTS bill_alignment_stance_snapshot
  ON bill_alignment(stance_snapshot_hash);

CREATE INDEX IF NOT EXISTS stance_signals_bill_dir_created
  ON stance_signals(bill_id, direction, created_at DESC);
