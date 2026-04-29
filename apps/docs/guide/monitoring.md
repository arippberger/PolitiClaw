# Manage Monitoring

This page is the controls reference: cadence values, the on-demand snapshot tool, and the mute commands. For the narrative version of what each cron job does over time, read [Recurring Monitoring](./recurring-monitoring).

## Core idea

PolitiClaw monitoring is built around a small set of plugin-owned cron templates plus a saved monitoring mode. You pick a mode by intent; the plugin maps it to the right subset of default jobs. Job names, schedules, and payloads are generated from the runtime — the [Generated Cron Jobs](../reference/generated/cron-jobs) page is the source of truth for the current set.

## User-facing controls

Default front door:

- [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) — saves address, stances, and monitoring mode in one flow. Re-run any time to change cadence.

Follow-ups:

- [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) — on-demand snapshot of recent and upcoming federal activity on your tracked issues.
- [`politiclaw_mutes`](../reference/generated/tools/politiclaw_mutes) — suppress a specific bill, rep, or issue without changing cadence. Use `action='add'`, `action='remove'`, or `action='list'`.

If you are choosing between overlapping monitoring paths, see [Entry Points by Goal](./entry-points-by-goal).

## Monitoring modes

The monitoring mode controls which default jobs stay enabled. Use `politiclaw_configure` to save or change it. Modes map to job sets as follows:

| Mode | What it does |
|---|---|
| `off` | Paused — PolitiClaw won't run on its own. |
| `quiet_watch` | Silent unless tracked bills or hearings materially change. |
| `weekly_digest` | Weekly digest (every 7 days from install) and monthly rep report, plus background change-watches. |
| `action_only` | Quiet except when an election is near or tracked items change. |
| `full_copilot` | Everything: digest, rep report, election alerts, background watches. |

Background change-watches (`rep_vote_watch`, `tracked_hearings`) are change-detection-gated — they produce no output during quiet windows, so even verbose modes stay silent when nothing has moved.

Switching modes re-reconciles jobs: templates outside the new mode are paused (not deleted), so flipping back is instant.

## Recommended workflow

1. Run `politiclaw_configure` until you have a saved address and at least one issue stance.
2. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor) to confirm storage, schema version, and key presence are all healthy.
3. Re-run `politiclaw_configure` any time you want to pick a different monitoring mode.
4. Use [`politiclaw_check_upcoming_votes`](../reference/generated/tools/politiclaw_check_upcoming_votes) when you want a manual snapshot.
5. Drop into the [Generated Cron Jobs](../reference/generated/cron-jobs) reference only when you need exact template behavior or operator-level debugging.

## See also

- [Recurring Monitoring](./recurring-monitoring) — what each cron job actually produces, the quiet-by-design contract, and what isn't yet proactive.
- [Examples of Good Alerts](./example-alerts) — the shape of each job's output.
