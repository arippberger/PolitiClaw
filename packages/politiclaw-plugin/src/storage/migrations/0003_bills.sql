-- Federal bills (api.congress.gov).
--
-- Only the bills table lands here; `bill_alignment` and `snapshots` arrive in
-- later migrations, so we never ship dead tables. `source_adapter_id` +
-- `source_tier` carry provenance through to tool output.

CREATE TABLE IF NOT EXISTS bills (
  id                  TEXT PRIMARY KEY,            -- "<congress>-<billType lowercased>-<number>"
  congress            INTEGER NOT NULL,
  bill_type           TEXT NOT NULL,               -- uppercase: HR, S, HJRES, ...
  number              TEXT NOT NULL,
  title               TEXT NOT NULL,
  origin_chamber      TEXT,                        -- 'House' | 'Senate'
  introduced_date     TEXT,                        -- ISO date
  latest_action_date  TEXT,
  latest_action_text  TEXT,
  policy_area         TEXT,
  subjects_json       TEXT,                        -- JSON array of subject names
  summary_text        TEXT,
  sponsors_json       TEXT,                        -- JSON array of sponsors
  update_date         TEXT,
  source_url          TEXT,
  last_synced         INTEGER NOT NULL,
  source_adapter_id   TEXT NOT NULL,
  source_tier         INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  raw                 TEXT                         -- original normalized Bill JSON for audit
);

CREATE INDEX IF NOT EXISTS bills_congress_type ON bills(congress, bill_type);
CREATE INDEX IF NOT EXISTS bills_latest_action ON bills(latest_action_date);
