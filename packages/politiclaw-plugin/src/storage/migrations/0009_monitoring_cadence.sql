-- User-configurable monitoring cadence.
--
-- Controls which PolitiClaw-owned cron jobs `setupMonitoring()` installs vs
-- pauses. Existing rows get the default ('election_proximity') on upgrade.

ALTER TABLE preferences
  ADD COLUMN monitoring_cadence TEXT NOT NULL DEFAULT 'election_proximity'
  CHECK (monitoring_cadence IN ('off','election_proximity','weekly','both'));
