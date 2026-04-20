-- Persisted bill-alignment scores.
--
-- Scoring is deterministic: we do NOT stack LLM summarization with LLM
-- judgment. The `relevance` column captures how much a bill touches stances
-- the user declared; `confidence` is a function of data richness. Raw numbers
-- are persisted even when
-- confidence is below the 0.4 floor so audit replay stays honest.
--
-- `stance_snapshot_hash` lets the same bill carry multiple scores across
-- different stance-list versions — re-reading an older alignment after the
-- user has edited stances returns that older computation unchanged.

CREATE TABLE IF NOT EXISTS bill_alignment (
  bill_id              TEXT NOT NULL,
  stance_snapshot_hash TEXT NOT NULL,
  relevance            REAL NOT NULL CHECK (relevance BETWEEN 0 AND 1),
  confidence           REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  matched_json         TEXT NOT NULL,
  rationale            TEXT NOT NULL,
  computed_at          INTEGER NOT NULL,
  source_adapter_id    TEXT NOT NULL,
  source_tier          INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  PRIMARY KEY (bill_id, stance_snapshot_hash),
  FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS bill_alignment_bill ON bill_alignment(bill_id);
CREATE INDEX IF NOT EXISTS bill_alignment_computed ON bill_alignment(computed_at);
