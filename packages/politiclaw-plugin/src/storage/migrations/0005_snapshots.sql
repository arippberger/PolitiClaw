-- Change-detection snapshots.
--
-- One row per (entity_kind, entity_id) captures the SHA-256 of the last
-- API-only payload we saw for that entity. This table must never be fed from
-- LLM-search output. Only API adapters (tier 1-3) produce snapshot inputs.
--
-- `hash_input_version` lets us change which fields we hash for a given kind
-- without silently drifting: bumping the version invalidates every old row
-- of that kind, which the domain layer treats as "new entity" (alert once)
-- rather than "unchanged" (silent). This is the honest failure mode.

CREATE TABLE IF NOT EXISTS snapshots (
  entity_kind         TEXT NOT NULL,
  entity_id           TEXT NOT NULL,
  hash_input_version  INTEGER NOT NULL,
  content_hash        TEXT NOT NULL,
  first_seen_at       INTEGER NOT NULL,
  last_seen_at        INTEGER NOT NULL,
  last_changed_at     INTEGER NOT NULL,
  source_adapter_id   TEXT NOT NULL,
  source_tier         INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  PRIMARY KEY (entity_kind, entity_id)
);

CREATE INDEX IF NOT EXISTS snapshots_kind ON snapshots(entity_kind);
CREATE INDEX IF NOT EXISTS snapshots_changed ON snapshots(last_changed_at);
