-- History of user-facing alerts: every bill or committee-event change that
-- `check_upcoming_votes` surfaced to the user, whether fired from a cron
-- tick or pulled manually. The dashboard reads the most recent rows for the
-- "Recent alerts" section.
--
-- Rows are append-only. There is no edit or delete path from user-facing
-- tooling; the log is intended to be an honest record of what the user has
-- been shown so alignment claims made in a rep report can be audited later.
--
-- `source_adapter_id` + `source_tier` travel with the row so the dashboard
-- can label provenance per alert without cross-referencing the current
-- resolver config (which may have changed since the alert fired).

CREATE TABLE IF NOT EXISTS alert_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at        INTEGER NOT NULL,
  kind              TEXT NOT NULL CHECK(kind IN ('bill_change', 'event_change')),
  ref_id            TEXT NOT NULL,
  change_reason     TEXT NOT NULL,
  summary           TEXT NOT NULL,
  source_adapter_id TEXT NOT NULL,
  source_tier       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS alert_history_created ON alert_history(created_at DESC);
CREATE INDEX IF NOT EXISTS alert_history_ref     ON alert_history(ref_id);
