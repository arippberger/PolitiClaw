# Generated Storage Schema

This page is generated from a real in-memory SQLite database after migrations run.

Migration count: 15.

## Migrations

- `packages/politiclaw-plugin/src/storage/migrations/0001_init.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0002_reps.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0003_bills.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0004_bill_alignment.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0005_snapshots.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0006_rep_votes.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0007_rep_scores.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0008_ballot.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0009_monitoring_cadence.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0010_letters.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0011_hot_path_indexes.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0012_alert_history.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0013_letter_redraft.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0014_monitoring_mode.sql`
- `packages/politiclaw-plugin/src/storage/migrations/0015_accountability.sql`

## Tables

### alert_history

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | no | yes | n/a |
| `created_at` | `INTEGER` | yes | no | n/a |
| `kind` | `TEXT` | yes | no | n/a |
| `ref_id` | `TEXT` | yes | no | n/a |
| `change_reason` | `TEXT` | yes | no | n/a |
| `summary` | `TEXT` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE alert_history (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at        INTEGER NOT NULL,
  kind              TEXT NOT NULL CHECK(kind IN ('bill_change', 'event_change')),
  ref_id            TEXT NOT NULL,
  change_reason     TEXT NOT NULL,
  summary           TEXT NOT NULL,
  source_adapter_id TEXT NOT NULL,
  source_tier       INTEGER NOT NULL
)
```

### alert_settings

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `key` | `TEXT` | no | yes | n/a |
| `value` | `TEXT` | yes | no | n/a |

```sql
CREATE TABLE alert_settings (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL
)
```

### ballot_explanations

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | no | yes | n/a |
| `election_day` | `TEXT` | no | no | n/a |
| `stance_snapshot_hash` | `TEXT` | no | no | n/a |
| `narrative_text` | `TEXT` | yes | no | n/a |
| `coverage_json` | `TEXT` | yes | no | n/a |
| `computed_at` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE ballot_explanations (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  election_day           TEXT,
  stance_snapshot_hash   TEXT,
  narrative_text         TEXT NOT NULL,
  coverage_json          TEXT NOT NULL,
  computed_at            INTEGER NOT NULL,
  source_adapter_id      TEXT NOT NULL,
  source_tier            INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5)
)
```

### ballots

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `address_hash` | `TEXT` | no | yes | n/a |
| `normalized_input_json` | `TEXT` | no | no | n/a |
| `election_json` | `TEXT` | no | no | n/a |
| `contests_json` | `TEXT` | yes | no | n/a |
| `logistics_json` | `TEXT` | yes | no | n/a |
| `fetched_at` | `INTEGER` | yes | no | n/a |
| `ttl_ms` | `INTEGER` | yes | no | `86400000` |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |
| `raw_response_json` | `TEXT` | yes | no | n/a |

```sql
CREATE TABLE ballots (
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
)
```

### bill_alignment

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `bill_id` | `TEXT` | yes | yes | n/a |
| `stance_snapshot_hash` | `TEXT` | yes | yes | n/a |
| `relevance` | `REAL` | yes | no | n/a |
| `confidence` | `REAL` | yes | no | n/a |
| `matched_json` | `TEXT` | yes | no | n/a |
| `rationale` | `TEXT` | yes | no | n/a |
| `computed_at` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE bill_alignment (
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
)
```

### bills

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | no | yes | n/a |
| `congress` | `INTEGER` | yes | no | n/a |
| `bill_type` | `TEXT` | yes | no | n/a |
| `number` | `TEXT` | yes | no | n/a |
| `title` | `TEXT` | yes | no | n/a |
| `origin_chamber` | `TEXT` | no | no | n/a |
| `introduced_date` | `TEXT` | no | no | n/a |
| `latest_action_date` | `TEXT` | no | no | n/a |
| `latest_action_text` | `TEXT` | no | no | n/a |
| `policy_area` | `TEXT` | no | no | n/a |
| `subjects_json` | `TEXT` | no | no | n/a |
| `summary_text` | `TEXT` | no | no | n/a |
| `sponsors_json` | `TEXT` | no | no | n/a |
| `update_date` | `TEXT` | no | no | n/a |
| `source_url` | `TEXT` | no | no | n/a |
| `last_synced` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |
| `raw` | `TEXT` | no | no | n/a |

```sql
CREATE TABLE bills (
  id                  TEXT PRIMARY KEY,            -- "<congress>-<billType lowercased>-<number>"
  congress            INTEGER NOT NULL,
  bill_type           TEXT NOT NULL,               -- uppercase: HR, S, HJRES, ...
  number              TEXT NOT NULL,
  title               TEXT NOT NULL,
  origin_chamber      TEXT,                        -- 'House' | 'Senate'
  introduced_date     TEXT,                        -- ISO date
  latest_action_date  TEXT,
  latest_action_text  TEXT,
  policy_area         TEXT,
  subjects_json       TEXT,                        -- JSON array of subject names
  summary_text        TEXT,
  sponsors_json       TEXT,                        -- JSON array of sponsors
  update_date         TEXT,
  source_url          TEXT,
  last_synced         INTEGER NOT NULL,
  source_adapter_id   TEXT NOT NULL,
  source_tier         INTEGER NOT NULL CHECK (source_tier BETWEEN 1 AND 5),
  raw                 TEXT                         -- original normalized Bill JSON for audit
)
```

### issue_stances

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `issue` | `TEXT` | no | yes | n/a |
| `weight` | `INTEGER` | yes | no | n/a |
| `stance` | `TEXT` | yes | no | n/a |
| `updated_at` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE issue_stances (
  issue           TEXT PRIMARY KEY,
  weight          INTEGER NOT NULL CHECK (weight BETWEEN 1 AND 5),
  stance          TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
)
```

### kv_store

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `key` | `TEXT` | no | yes | n/a |
| `value` | `TEXT` | yes | no | n/a |
| `updated_at` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE kv_store (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  updated_at      INTEGER NOT NULL
)
```

### letters

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | no | yes | n/a |
| `rep_id` | `TEXT` | yes | no | n/a |
| `rep_name` | `TEXT` | yes | no | n/a |
| `rep_office` | `TEXT` | yes | no | n/a |
| `issue` | `TEXT` | yes | no | n/a |
| `bill_id` | `TEXT` | no | no | n/a |
| `subject` | `TEXT` | yes | no | n/a |
| `body` | `TEXT` | yes | no | n/a |
| `citations_json` | `TEXT` | yes | no | n/a |
| `stance_snapshot_hash` | `TEXT` | yes | no | n/a |
| `word_count` | `INTEGER` | yes | no | n/a |
| `created_at` | `INTEGER` | yes | no | n/a |
| `redraft_requested_at` | `INTEGER` | no | no | n/a |

```sql
CREATE TABLE letters (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  rep_id                TEXT NOT NULL,
  rep_name              TEXT NOT NULL,
  rep_office            TEXT NOT NULL,
  issue                 TEXT NOT NULL,
  bill_id               TEXT,
  subject               TEXT NOT NULL,
  body                  TEXT NOT NULL,
  citations_json        TEXT NOT NULL,
  stance_snapshot_hash  TEXT NOT NULL,
  word_count            INTEGER NOT NULL,
  created_at            INTEGER NOT NULL
, redraft_requested_at INTEGER)
```

### member_votes

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `vote_id` | `TEXT` | yes | yes | n/a |
| `bioguide_id` | `TEXT` | yes | yes | n/a |
| `position` | `TEXT` | yes | no | n/a |
| `first_name` | `TEXT` | no | no | n/a |
| `last_name` | `TEXT` | no | no | n/a |
| `party` | `TEXT` | no | no | n/a |
| `state` | `TEXT` | no | no | n/a |

```sql
CREATE TABLE member_votes (
  vote_id      TEXT NOT NULL,
  bioguide_id  TEXT NOT NULL,
  position     TEXT NOT NULL CHECK (position IN ('Yea', 'Nay', 'Present', 'Not Voting')),
  first_name   TEXT,
  last_name    TEXT,
  party        TEXT,
  state        TEXT,
  PRIMARY KEY (vote_id, bioguide_id),
  FOREIGN KEY (vote_id) REFERENCES roll_call_votes(id) ON DELETE CASCADE
)
```

### mute_list

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `kind` | `TEXT` | yes | yes | n/a |
| `ref` | `TEXT` | yes | yes | n/a |
| `reason` | `TEXT` | no | no | n/a |
| `muted_at` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE mute_list (
  kind            TEXT NOT NULL CHECK (kind IN ('bill','rep','issue')),
  ref             TEXT NOT NULL,
  reason          TEXT,
  muted_at        INTEGER NOT NULL,
  PRIMARY KEY (kind, ref)
)
```

### preferences

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | no | yes | n/a |
| `address` | `TEXT` | yes | no | n/a |
| `zip` | `TEXT` | no | no | n/a |
| `state` | `TEXT` | no | no | n/a |
| `district` | `TEXT` | no | no | n/a |
| `monitoring_mode` | `TEXT` | yes | no | `'action_only'` |
| `updated_at` | `INTEGER` | yes | no | n/a |
| `accountability` | `TEXT` | yes | no | `'self_serve'` |

```sql
CREATE TABLE "preferences" (
  id                 INTEGER PRIMARY KEY CHECK (id = 1),
  address            TEXT NOT NULL,
  zip                TEXT,
  state              TEXT,
  district           TEXT,
  monitoring_mode    TEXT NOT NULL DEFAULT 'action_only'
    CHECK (monitoring_mode IN ('off','quiet_watch','weekly_digest','action_only','full_copilot')),
  updated_at         INTEGER NOT NULL
, accountability TEXT NOT NULL DEFAULT 'self_serve'
  CHECK (accountability IN ('self_serve','nudge_me','draft_for_me')))
```

### rep_scores

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `rep_id` | `TEXT` | yes | yes | n/a |
| `stance_snapshot_hash` | `TEXT` | yes | yes | n/a |
| `issue` | `TEXT` | yes | yes | n/a |
| `aligned_count` | `INTEGER` | yes | no | n/a |
| `conflicted_count` | `INTEGER` | yes | no | n/a |
| `considered_count` | `INTEGER` | yes | no | n/a |
| `relevance` | `REAL` | yes | no | n/a |
| `confidence` | `REAL` | yes | no | n/a |
| `alignment_score` | `REAL` | yes | no | n/a |
| `rationale` | `TEXT` | yes | no | n/a |
| `cited_bills_json` | `TEXT` | yes | no | n/a |
| `procedural_excluded` | `INTEGER` | yes | no | n/a |
| `computed_at` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE rep_scores (
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
)
```

### reps

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | no | yes | n/a |
| `name` | `TEXT` | yes | no | n/a |
| `office` | `TEXT` | yes | no | n/a |
| `party` | `TEXT` | no | no | n/a |
| `jurisdiction` | `TEXT` | no | no | n/a |
| `district` | `TEXT` | no | no | n/a |
| `state` | `TEXT` | no | no | n/a |
| `contact` | `TEXT` | no | no | n/a |
| `last_synced` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |
| `raw` | `TEXT` | no | no | n/a |

```sql
CREATE TABLE reps (
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
)
```

### roll_call_votes

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `TEXT` | no | yes | n/a |
| `chamber` | `TEXT` | yes | no | n/a |
| `congress` | `INTEGER` | yes | no | n/a |
| `session` | `INTEGER` | yes | no | n/a |
| `roll_call_number` | `INTEGER` | yes | no | n/a |
| `start_date` | `TEXT` | no | no | n/a |
| `update_date` | `TEXT` | no | no | n/a |
| `vote_type` | `TEXT` | no | no | n/a |
| `result` | `TEXT` | no | no | n/a |
| `vote_question` | `TEXT` | no | no | n/a |
| `bill_id` | `TEXT` | no | no | n/a |
| `amendment_id` | `TEXT` | no | no | n/a |
| `amendment_author` | `TEXT` | no | no | n/a |
| `legislation_url` | `TEXT` | no | no | n/a |
| `source_url` | `TEXT` | no | no | n/a |
| `is_procedural` | `INTEGER` | no | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |
| `synced_at` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE roll_call_votes (
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
)
```

### schema_version

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `version` | `INTEGER` | no | yes | n/a |

```sql
CREATE TABLE schema_version (
    version INTEGER PRIMARY KEY
  )
```

### snapshots

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `entity_kind` | `TEXT` | yes | yes | n/a |
| `entity_id` | `TEXT` | yes | yes | n/a |
| `hash_input_version` | `INTEGER` | yes | no | n/a |
| `content_hash` | `TEXT` | yes | no | n/a |
| `first_seen_at` | `INTEGER` | yes | no | n/a |
| `last_seen_at` | `INTEGER` | yes | no | n/a |
| `last_changed_at` | `INTEGER` | yes | no | n/a |
| `source_adapter_id` | `TEXT` | yes | no | n/a |
| `source_tier` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE snapshots (
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
)
```

### stance_signals

| Column | Type | Not Null | Primary Key | Default |
| --- | --- | --- | --- | --- |
| `id` | `INTEGER` | no | yes | n/a |
| `issue` | `TEXT` | no | no | n/a |
| `bill_id` | `TEXT` | no | no | n/a |
| `direction` | `TEXT` | yes | no | n/a |
| `weight` | `REAL` | yes | no | `1.0` |
| `source` | `TEXT` | yes | no | n/a |
| `created_at` | `INTEGER` | yes | no | n/a |

```sql
CREATE TABLE stance_signals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  issue           TEXT,
  bill_id         TEXT,
  direction       TEXT NOT NULL CHECK (direction IN ('agree','disagree','skip')),
  weight          REAL NOT NULL DEFAULT 1.0,
  source          TEXT NOT NULL,
  created_at      INTEGER NOT NULL
)
```

## Indexes

| Index | Table | Definition |
| --- | --- | --- |
| `alert_history_created` | `alert_history` | `CREATE INDEX alert_history_created ON alert_history(created_at DESC)` |
| `alert_history_ref` | `alert_history` | `CREATE INDEX alert_history_ref     ON alert_history(ref_id)` |
| `ballot_explanations_computed` | `ballot_explanations` | `CREATE INDEX ballot_explanations_computed ON ballot_explanations(computed_at DESC)` |
| `ballots_fetched` | `ballots` | `CREATE INDEX ballots_fetched ON ballots(fetched_at)` |
| `bill_alignment_bill` | `bill_alignment` | `CREATE INDEX bill_alignment_bill ON bill_alignment(bill_id)` |
| `bill_alignment_computed` | `bill_alignment` | `CREATE INDEX bill_alignment_computed ON bill_alignment(computed_at)` |
| `bill_alignment_stance_snapshot` | `bill_alignment` | `CREATE INDEX bill_alignment_stance_snapshot   ON bill_alignment(stance_snapshot_hash)` |
| `bills_congress_type` | `bills` | `CREATE INDEX bills_congress_type ON bills(congress, bill_type)` |
| `bills_latest_action` | `bills` | `CREATE INDEX bills_latest_action ON bills(latest_action_date)` |
| `letters_created` | `letters` | `CREATE INDEX letters_created ON letters(created_at DESC)` |
| `letters_issue` | `letters` | `CREATE INDEX letters_issue   ON letters(issue)` |
| `letters_redraft_requested` | `letters` | `CREATE INDEX letters_redraft_requested   ON letters(redraft_requested_at)   WHERE redraft_requested_at IS NOT NULL` |
| `letters_rep` | `letters` | `CREATE INDEX letters_rep     ON letters(rep_id)` |
| `member_votes_bioguide` | `member_votes` | `CREATE INDEX member_votes_bioguide ON member_votes(bioguide_id)` |
| `member_votes_position` | `member_votes` | `CREATE INDEX member_votes_position ON member_votes(position)` |
| `rep_scores_computed` | `rep_scores` | `CREATE INDEX rep_scores_computed  ON rep_scores(computed_at)` |
| `rep_scores_issue` | `rep_scores` | `CREATE INDEX rep_scores_issue     ON rep_scores(issue)` |
| `rep_scores_rep` | `rep_scores` | `CREATE INDEX rep_scores_rep       ON rep_scores(rep_id)` |
| `reps_state` | `reps` | `CREATE INDEX reps_state ON reps(state)` |
| `roll_call_votes_bill` | `roll_call_votes` | `CREATE INDEX roll_call_votes_bill      ON roll_call_votes(bill_id)` |
| `roll_call_votes_congress` | `roll_call_votes` | `CREATE INDEX roll_call_votes_congress  ON roll_call_votes(congress, session)` |
| `roll_call_votes_update` | `roll_call_votes` | `CREATE INDEX roll_call_votes_update    ON roll_call_votes(update_date)` |
| `snapshots_changed` | `snapshots` | `CREATE INDEX snapshots_changed ON snapshots(last_changed_at)` |
| `snapshots_kind` | `snapshots` | `CREATE INDEX snapshots_kind ON snapshots(entity_kind)` |
| `stance_signals_bill` | `stance_signals` | `CREATE INDEX stance_signals_bill  ON stance_signals(bill_id)` |
| `stance_signals_bill_dir_created` | `stance_signals` | `CREATE INDEX stance_signals_bill_dir_created   ON stance_signals(bill_id, direction, created_at DESC)` |
| `stance_signals_issue` | `stance_signals` | `CREATE INDEX stance_signals_issue ON stance_signals(issue)` |
