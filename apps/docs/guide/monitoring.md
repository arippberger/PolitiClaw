# Monitoring

## Core Idea

PolitiClaw monitoring is built around a small set of plugin-owned cron templates plus a saved user cadence. The exact job names, schedules, and payloads live in the generated reference:

- [Generated Cron Jobs](../reference/generated/cron-jobs)

## User-Facing Controls

The main runtime surfaces are:

- [`politiclaw_set_monitoring_cadence`](../reference/generated/tools/politiclaw_set_monitoring_cadence)
- [`politiclaw_setup_monitoring`](../reference/generated/tools/politiclaw_setup_monitoring)
- [`politiclaw_pause_monitoring`](../reference/generated/tools/politiclaw_pause_monitoring)
- [`politiclaw_resume_monitoring`](../reference/generated/tools/politiclaw_resume_monitoring)
- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes)

## What Changes With Cadence

The cadence setting controls which default monitoring jobs stay enabled. The generated cron page is the source of truth for the current templates, but the intent is:

- `off`: install nothing.
- `election_proximity`: keep the quieter watch posture plus election ramp-up alerts.
- `weekly`: add the digest-style jobs.
- `both`: enable the full default set.

## What Monitoring Does Not Do

Monitoring does not edit user-authored cron jobs, and it does not quietly fabricate summaries when a source is unavailable. The runtime returns actionable failures or partial results instead.

## Recommended Workflow

1. Save preferences and issue stances first.
2. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor).
3. Set a cadence.
4. Use the generated cron reference when you need to inspect exact template behavior.
