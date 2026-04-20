-- Persisted House roll-call votes + per-member positions.
--
-- Source-of-truth is api.congress.gov's `/house-vote` beta endpoints (tier 1)
-- for House data. Senate roll-call votes are intentionally NOT persisted here
-- yet — api.congress.gov has no `/senate-vote` endpoint as of 2026-04-19, and
-- LLM search is not an acceptable replacement.
--
-- `source_adapter_id` + `source_tier` carry adapter provenance so
-- representative scoring and any future audit surface can tag each rationale
-- line.
--
-- `is_procedural` is an INTEGER (0/1). Left NULL when only the list payload
-- has been ingested — `voteQuestion` (the classification input) lives on the
-- detail/members endpoint. Scoring treats NULL as "unknown" and excludes
-- those rows from non-opt-in tallies.

CREATE TABLE IF NOT EXISTS roll_call_votes (
  id                  TEXT PRIMARY KEY,                  -- `<chamber>-<congress>-<session>-<rollCall>`
  chamber             TEXT NOT NULL CHECK (chamber IN ('House', 'Senate')),
  congress            INTEGER NOT NULL,
  session             INTEGER NOT NULL CHECK (session IN (1, 2)),
  roll_call_number    INTEGER NOT NULL,
  start_date          TEXT,
  update_date         TEXT,
  vote_type           TEXT,
  result              TEXT,
  vote_question       TEXT,
  bill_id             TEXT,                              -- canonical `<congress>-<type>-<number>` when applicable
  amendment_id        TEXT,
  amendment_author    TEXT,
  legislation_url     TEXT,
  source_url          TEXT,
  is_procedural       INTEGER,                           -- 0/1/NULL-unknown
  source_adapter_id   TEXT NOT NULL,
  source_tier         INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  synced_at           INTEGER NOT NULL,
  UNIQUE (chamber, congress, session, roll_call_number)
);

CREATE INDEX IF NOT EXISTS roll_call_votes_bill      ON roll_call_votes(bill_id);
CREATE INDEX IF NOT EXISTS roll_call_votes_congress  ON roll_call_votes(congress, session);
CREATE INDEX IF NOT EXISTS roll_call_votes_update    ON roll_call_votes(update_date);

-- One row per (vote, member). `position` is normalized to House clerk
-- terminology — "Aye" collapses to "Yea" at the adapter boundary so scoring
-- sees a single canonical value.

CREATE TABLE IF NOT EXISTS member_votes (
  vote_id      TEXT NOT NULL,
  bioguide_id  TEXT NOT NULL,
  position     TEXT NOT NULL CHECK (position IN ('Yea', 'Nay', 'Present', 'Not Voting')),
  first_name   TEXT,
  last_name    TEXT,
  party        TEXT,
  state        TEXT,
  PRIMARY KEY (vote_id, bioguide_id),
  FOREIGN KEY (vote_id) REFERENCES roll_call_votes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS member_votes_bioguide ON member_votes(bioguide_id);
CREATE INDEX IF NOT EXISTS member_votes_position ON member_votes(position);
