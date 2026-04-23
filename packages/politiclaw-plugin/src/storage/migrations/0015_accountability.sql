-- User-selectable accountability mode.
--
-- Controls how proactive PolitiClaw monitoring is when a tracked bill or rep
-- vote crosses an alignment threshold. Mode names are product-shaped, not
-- behavior-shaped, so the wire format stays stable as downstream skills
-- evolve.
--
-- Existing rows are backfilled with 'self_serve' (status quo: monitoring
-- posts deltas only; user takes any follow-up action themselves). The
-- onboarding flow re-prompts existing users once via a kv_store flag so the
-- backfill default isn't silently locked in.

ALTER TABLE preferences
  ADD COLUMN accountability TEXT NOT NULL DEFAULT 'self_serve'
  CHECK (accountability IN ('self_serve','nudge_me','draft_for_me'));
