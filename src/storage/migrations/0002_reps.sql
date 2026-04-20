-- Representatives for the user's address.
--
-- `source_adapter_id` + `source_tier` carry the adapter id and tier so
-- downstream tools can label rep data by provenance.

CREATE TABLE IF NOT EXISTS reps (
  id                TEXT PRIMARY KEY,           -- stable external id (bioguide where available)
  name              TEXT NOT NULL,
  office            TEXT NOT NULL,              -- 'US Senate' | 'US House' | 'Governor' | ...
  party             TEXT,
  jurisdiction      TEXT,                       -- 'US-CA-12', state code, etc.
  district          TEXT,                       -- numeric district for House members; null for Senate
  state             TEXT,                       -- 2-letter code for federal reps
  contact           TEXT,                       -- JSON blob: phone, url, address (adapter-shaped)
  last_synced       INTEGER NOT NULL,
  source_adapter_id TEXT NOT NULL,
  source_tier       INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  raw               TEXT                         -- original JSON from the source adapter
);

CREATE INDEX IF NOT EXISTS reps_state ON reps(state);
