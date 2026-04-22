# Manage Monitoring

## Core Idea

PolitiClaw monitoring is built around a small set of plugin-owned cron templates plus a saved user cadence. The exact job names, schedules, and payloads live in the generated reference:

- [Generated Cron Jobs](../reference/generated/cron-jobs)

## User-Facing Controls

Default front door:

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure)

Follow-up:

- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes)

If you are choosing between overlapping monitoring paths, see [Entry Points by Goal](./entry-points-by-goal).

## What Changes With Cadence

The cadence setting controls which default monitoring jobs stay enabled. Use `politiclaw_configure` to save or change that cadence. The generated cron page is the source of truth for the current templates, but the intent is:

- `off`: install nothing.
- `election_proximity`: keep the quieter watch posture plus election ramp-up alerts.
- `weekly`: add the digest-style jobs.
- `both`: enable the full default set.

## What Monitoring Does Not Do

Monitoring does not edit user-authored cron jobs, and it does not quietly fabricate summaries when a source is unavailable. The runtime returns actionable failures or partial results instead.

## Recommended Workflow

1. Run `politiclaw_configure` until you have a saved address and at least one issue stance.
2. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor).
3. Re-run `politiclaw_configure` any time you want a different cadence.
4. Use [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) when you want a manual snapshot.
5. Use the generated cron reference only when you need to inspect exact template behavior or debug operator paths.
