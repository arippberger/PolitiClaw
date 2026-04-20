-- Persisted per-(rep, issue) alignment scores.
--
-- A rep's alignment on an issue is computed by joining:
--   - the user's declared `issue_stances` (support/oppose, weight),
--   - the user's `stance_signals` on specific bills (direction: agree/disagree
--     — "skip" signals are ignored for scoring), which provide the per-bill
--     *direction* that `bill_alignment` intentionally does not infer
--     (we refuse to stack LLM summarization and judgment),
--   - `bill_alignment` rows (which bills touch which issues, and how strongly),
--   - `member_votes` rows joined on `bioguide_id` (how the rep actually voted).
--
-- Procedural votes (`is_procedural = 1` or NULL) are excluded by default per
-- default — inferring substantive alignment from motions-to-adjourn and
-- similar votes would be misleading. The domain layer exposes
-- `includeProcedural: true` as an opt-in for callers that want the raw tally.
--
-- `stance_snapshot_hash` is carried through from bill alignment so re-reading
-- an older rep score after the user edits stances returns that earlier
-- computation unchanged; a re-score writes a new row under the new hash. This
-- keeps audit replay honest without a separate history table.
--
-- Confidence below the 0.4 floor is persisted for audit but must render as
-- "insufficient data" at every user-facing surface.

CREATE TABLE IF NOT EXISTS rep_scores (
  rep_id               TEXT NOT NULL,
  stance_snapshot_hash TEXT NOT NULL,
  issue                TEXT NOT NULL,
  aligned_count        INTEGER NOT NULL CHECK (aligned_count >= 0),
  conflicted_count     INTEGER NOT NULL CHECK (conflicted_count >= 0),
  considered_count     INTEGER NOT NULL CHECK (considered_count >= 0),
  relevance            REAL NOT NULL CHECK (relevance BETWEEN 0 AND 1),
  confidence           REAL NOT NULL CHECK (confidence BETWEEN 0 AND 1),
  alignment_score      REAL NOT NULL CHECK (alignment_score BETWEEN 0 AND 1),
  rationale            TEXT NOT NULL,
  cited_bills_json     TEXT NOT NULL,
  procedural_excluded  INTEGER NOT NULL CHECK (procedural_excluded IN (0, 1)),
  computed_at          INTEGER NOT NULL,
  source_adapter_id    TEXT NOT NULL,
  source_tier          INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  PRIMARY KEY (rep_id, stance_snapshot_hash, issue),
  FOREIGN KEY (rep_id) REFERENCES reps(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS rep_scores_rep       ON rep_scores(rep_id);
CREATE INDEX IF NOT EXISTS rep_scores_issue     ON rep_scores(issue);
CREATE INDEX IF NOT EXISTS rep_scores_computed  ON rep_scores(computed_at);
