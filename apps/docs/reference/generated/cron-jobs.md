# Generated Cron Jobs

This page is generated from `packages/politiclaw-plugin/src/cron/templates.ts`.

Current template count: 5.

| Name | Schedule | Session Target | Wake Mode | Delivery |
| --- | --- | --- | --- | --- |
| `politiclaw.weekly_summary` | every 7 day(s) | `isolated` | `next-heartbeat` | `announce:last` |
| `politiclaw.rep_vote_watch` | every 6 hour(s) | `isolated` | `next-heartbeat` | `announce:last` |
| `politiclaw.tracked_hearings` | every 12 hour(s) | `isolated` | `next-heartbeat` | `announce:last` |
| `politiclaw.rep_report` | every 30 day(s) | `isolated` | `next-heartbeat` | `announce:last` |
| `politiclaw.election_proximity_alert` | every 1 day(s) | `isolated` | `next-heartbeat` | `announce:last` |

## politiclaw.weekly_summary

- Description: PolitiClaw weekly digest. Reads the politiclaw-summary skill and posts a single message with tracked-bill movement, upcoming events, a mandatory dissenting-view item, and any source outages from the past 7 days.
- Schedule: every 7 day(s)
- Session target: `isolated`
- Wake mode: `next-heartbeat`
- Delivery: `announce:last`

### Payload

```text
Run the PolitiClaw weekly summary. Read the politiclaw-summary skill and follow its section order exactly. Call politiclaw_check_upcoming_votes with a 7-day window, then compose the digest per skills/politiclaw-summary/SKILL.md. Required: include the 'Things you might be surprised by' dissenting-view section. If the delta is empty, post the one-line quiet-week message per the skill — do not pad.
```

## politiclaw.rep_vote_watch

- Description: Every 6h: checks for new or materially changed federal bills and committee events affecting tracked issues (change-detection-gated, so quiet windows produce no output). Pair with politiclaw_ingest_votes for tier-1 House and tier-2 Senate roll calls.
- Schedule: every 6 hour(s)
- Session target: `isolated`
- Wake mode: `next-heartbeat`
- Delivery: `announce:last`

### Payload

```text
Run the PolitiClaw rep-vote watch. Read the politiclaw-monitoring skill. Call politiclaw_check_upcoming_votes with the default (recent) window. Only surface bills flagged as [new] or [changed] whose alignment crosses the confidence floor. If the delta is empty, post the one-line silent-ok message per the skill — do not pad. Prioritize bill-status deltas and committee activity unless politiclaw_ingest_votes has populated House and Senate roll calls.
```

## politiclaw.tracked_hearings

- Description: Every 12h: surfaces newly-scheduled committee hearings and markups whose related bills touch the user's declared issue stances. Silent when no tracked issues are on upcoming committee agendas.
- Schedule: every 12 hour(s)
- Session target: `isolated`
- Wake mode: `next-heartbeat`
- Delivery: `announce:last`

### Payload

```text
Run the PolitiClaw tracked-hearings sweep. Read the politiclaw-monitoring skill. Call politiclaw_check_upcoming_votes and surface only upcoming committee events whose relatedBillIds overlap a tracked bill, or bills whose alignment crosses the confidence floor against declared stances. If the delta contains no tracked-issue matches, post the one-line silent-ok message per the skill — do not pad.
```

## politiclaw.rep_report

- Description: Every ~30 days: deterministic representative alignment digest vs. declared issue stances and recorded bill signals (House roll calls only until Senate ingest lands). Calls politiclaw_rep_report; keeps the alignment disclaimer, dissenting-view coverage, and blind-spot callouts intact.
- Schedule: every 30 day(s)
- Session target: `isolated`
- Wake mode: `next-heartbeat`
- Delivery: `announce:last`

### Payload

```text
Run the PolitiClaw periodic representative alignment report. Read skills/politiclaw-monitoring/SKILL.md → Rep report (periodic digest). Call politiclaw_rep_report once. Include the dissenting-view requirement where applicable; never strip the alignment disclaimer footer from tool output when scores are shown. If the tool returns no_stances or no_reps, post only the actionable fix.
```

## politiclaw.election_proximity_alert

- Description: Daily: when an election is within 30/14/7/1 days of the saved address, ramps a short alert ('election in N days') and points at politiclaw_prepare_me_for_my_next_election. Silent on days that do not cross a threshold.
- Schedule: every 1 day(s)
- Session target: `isolated`
- Wake mode: `next-heartbeat`
- Delivery: `announce:last`

### Payload

```text
Run the PolitiClaw election-proximity check. Read skills/politiclaw-monitoring/SKILL.md → Election proximity alerts. Call politiclaw_get_my_ballot to read the next election date for the saved address. If the election is 30, 14, 7, or 1 day away, post one short line ('Election in N days at <polling place or address>') and recommend politiclaw_prepare_me_for_my_next_election. On other days post nothing.
```
