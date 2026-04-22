-- Adds a `redraft_requested_at` flag to the `letters` table.
--
-- When the user clicks "re-draft" on a past letter from the dashboard, the
-- POST handler stamps this column with the current epoch ms. The flag is a
-- queue marker the agent can pick up: a future letter-draft tool run for the
-- same (rep, issue, billId) sees the request, regenerates with current
-- context, and (when it does) the new row supersedes the old one.
--
-- We do NOT delete the original letter — keeping it preserves the audit
-- trail (`stance_snapshot_hash` captures the inputs that shaped the original
-- draft). The dashboard hides re-drafted letters from the "needs attention"
-- count; the row is still listable.
--
-- Nullable (NULL = no re-draft requested). No default.

ALTER TABLE letters ADD COLUMN redraft_requested_at INTEGER;

CREATE INDEX IF NOT EXISTS letters_redraft_requested
  ON letters(redraft_requested_at)
  WHERE redraft_requested_at IS NOT NULL;
