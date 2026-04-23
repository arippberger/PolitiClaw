-- Action packages: optional, lightweight action support offered when the
-- plugin decides a change qualifies as a decision point (e.g. a tracked
-- bill is scheduled for a committee vote within 14 days). Offered, not
-- pushed; the user uses, dismisses, or stops each one.
--
-- Split from alert_history because packages have lifecycle (feedback,
-- dismissal, lazy generation) while alert rows are terminal audit entries.
--
-- `decision_hash` is computed over the inputs that made the trigger fire
-- (thresholds, target tuple, nearest event date, etc.) so rapid re-runs
-- on identical state do not re-offer the same package. Enforced via the
-- unique index below.

CREATE TABLE IF NOT EXISTS action_packages (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at                INTEGER NOT NULL,
  trigger_class             TEXT NOT NULL CHECK(trigger_class IN (
                              'bill_nearing_vote',
                              'tracked_event_scheduled',
                              'repeated_misalignment',
                              'election_proximity',
                              'new_bill_high_relevance'
                            )),
  package_kind              TEXT NOT NULL CHECK(package_kind IN (
                              'outreach',
                              'reminder',
                              'election_prep_prompt'
                            )),
  outreach_mode             TEXT CHECK(outreach_mode IN ('letter','call')),
  bill_id                   TEXT,
  rep_id                    TEXT,
  issue                     TEXT,
  election_date             TEXT,
  decision_hash             TEXT NOT NULL,
  summary                   TEXT NOT NULL,
  status                    TEXT NOT NULL DEFAULT 'open'
                            CHECK(status IN ('open','used','dismissed','stopped','expired')),
  status_at                 INTEGER NOT NULL,
  generated_letter_id       INTEGER,
  generated_call_script_id  INTEGER,
  generated_reminder_id     INTEGER,
  source_adapter_id         TEXT NOT NULL,
  source_tier               INTEGER NOT NULL CHECK(source_tier BETWEEN 1 AND 5)
);

CREATE INDEX IF NOT EXISTS action_packages_open
  ON action_packages(status, created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS action_packages_target
  ON action_packages(trigger_class, bill_id, rep_id, issue);
CREATE UNIQUE INDEX IF NOT EXISTS action_packages_decision_hash
  ON action_packages(trigger_class, bill_id, rep_id, issue, election_date, decision_hash);

CREATE TABLE IF NOT EXISTS action_package_feedback (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  package_id   INTEGER NOT NULL REFERENCES action_packages(id),
  created_at   INTEGER NOT NULL,
  verdict      TEXT NOT NULL CHECK(verdict IN ('useful','not_now','stop')),
  note         TEXT
);

CREATE INDEX IF NOT EXISTS action_package_feedback_package
  ON action_package_feedback(package_id, created_at DESC);

-- Call scripts: deterministic slot-fill, mirrors the letters table.
-- Copy-paste ready; PolitiClaw never dials a phone. Phone numbers are
-- pulled from the stored rep contact record — never invented or
-- LLM-guessed. If no phone is on file, the draft path returns
-- no_phone_on_file with the rep's official site as actionable.

CREATE TABLE IF NOT EXISTS call_scripts (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id                TEXT NOT NULL,
  rep_name              TEXT NOT NULL,
  rep_office            TEXT NOT NULL,
  issue                 TEXT NOT NULL,
  bill_id               TEXT,
  opening_line          TEXT NOT NULL,
  ask_line              TEXT NOT NULL,
  one_specific_line     TEXT,
  closing_line          TEXT NOT NULL,
  phone_number          TEXT,
  stance_snapshot_hash  TEXT NOT NULL,
  word_count            INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS call_scripts_rep     ON call_scripts(rep_id);
CREATE INDEX IF NOT EXISTS call_scripts_issue   ON call_scripts(issue);
CREATE INDEX IF NOT EXISTS call_scripts_created ON call_scripts(created_at DESC);

-- Reminders: user-visible bookmarks anchored to a bill, event, or
-- election date. Steps are stored as a JSON array string. Reminders
-- do not schedule their own notifications; the existing tracked_hearings
-- and election_proximity_alert crons re-read open reminders each tick
-- and surface any whose deadline is within 48 hours.

CREATE TABLE IF NOT EXISTS reminders (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  title                 TEXT NOT NULL,
  deadline              TEXT,
  anchor_bill_id        TEXT,
  anchor_event_id       TEXT,
  anchor_election_date  TEXT,
  steps_json            TEXT NOT NULL,
  created_at            INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS reminders_deadline ON reminders(deadline);
CREATE INDEX IF NOT EXISTS reminders_created  ON reminders(created_at DESC);
