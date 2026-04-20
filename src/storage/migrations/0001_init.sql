-- Baseline preferences + stance signals + light KV.
-- The full data model (reps, bills, scores, etc.) arrives in later migrations;
-- this migration only covers what the initial preference and signal tools write.

CREATE TABLE IF NOT EXISTS preferences (
  id              INTEGER PRIMARY KEY CHECK (id = 1),
  address         TEXT NOT NULL,
  zip             TEXT,
  state           TEXT,
  district        TEXT,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS issue_stances (
  issue           TEXT PRIMARY KEY,
  weight          INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 5),
  stance          TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS stance_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  issue           TEXT,
  bill_id         TEXT,
  direction       TEXT NOT NULL CHECK (direction IN ('agree','disagree','skip')),
  weight          REAL NOT NULL DEFAULT 1.0,
  source          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS stance_signals_issue ON stance_signals(issue);
CREATE INDEX IF NOT EXISTS stance_signals_bill  ON stance_signals(bill_id);

CREATE TABLE IF NOT EXISTS alert_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS mute_list (
  kind            TEXT NOT NULL CHECK (kind IN ('bill','rep','issue')),
  ref             TEXT NOT NULL,
  reason          TEXT,
  muted_at        INTEGER NOT NULL,
  PRIMARY KEY (kind, ref)
);

CREATE TABLE IF NOT EXISTS kv_store (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
);
