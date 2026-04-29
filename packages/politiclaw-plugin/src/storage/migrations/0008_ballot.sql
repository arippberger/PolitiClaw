-- Ballot logistics cache + audited explanations.
--
-- `ballots` caches Google Civic voterInfoQuery (and future adapter) payloads;
-- `ballot_explanations` stores deterministic ballot-framing output.

CREATE TABLE IF NOT EXISTS ballots (
  address_hash           TEXT PRIMARY KEY,
  normalized_input_json  TEXT,
  election_json          TEXT,
  contests_json          TEXT NOT NULL,
  logistics_json         TEXT NOT NULL,
  fetched_at             INTEGER NOT NULL,
  ttl_ms                 INTEGER NOT NULL DEFAULT 86400000,
  source_adapter_id      TEXT NOT NULL,
  source_tier            INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  raw_response_json      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS ballots_fetched ON ballots(fetched_at);

CREATE TABLE IF NOT EXISTS ballot_explanations (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  election_day           TEXT,
  stance_snapshot_hash   TEXT,
  narrative_text         TEXT NOT NULL,
  coverage_json          TEXT NOT NULL,
  computed_at            INTEGER NOT NULL,
  source_adapter_id      TEXT NOT NULL,
  source_tier            INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS ballot_explanations_computed ON ballot_explanations(computed_at DESC);
