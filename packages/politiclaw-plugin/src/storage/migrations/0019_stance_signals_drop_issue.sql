-- Drop the `issue` column from `stance_signals`.
--
-- The column was originally meant to support issue-only signals (recorded
-- without a bill, e.g. "I generally agree with the climate stance"). No
-- consumer ever read those rows: rep scoring, the repeated-misalignment
-- action-moment trigger, and coverage diagnostics all filter
-- `bill_id IS NOT NULL` (or inner-join on `bill_id`). The writer was the
-- only producer.
--
-- Action:
--   1. Drop the unused `stance_signals_issue` index.
--   2. Delete any orphaned rows that have no `bill_id` (these were already
--      invisible to every reader).
--   3. Drop the `issue` column.

DROP INDEX IF EXISTS stance_signals_issue;

DELETE FROM stance_signals WHERE bill_id IS NULL;

ALTER TABLE stance_signals DROP COLUMN issue;
