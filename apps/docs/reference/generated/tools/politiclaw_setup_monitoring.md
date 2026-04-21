# politiclaw_setup_monitoring

- Label: Install PolitiClaw default monitoring cron jobs
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/monitoringSetup.ts`

## Description

Install (or upsert in place) the default PolitiClaw monitoring cron jobs: weekly_summary (every 7d), rep_vote_watch (every 6h), tracked_hearings (every 12h), rep_report (~every 30d). Idempotent — re-running patches existing jobs rather than duplicating them. Submits via the gateway's cron.add / cron.update RPC; does not edit jobs.json directly. Behavior of each job is controlled by the skills/politiclaw-monitoring and skills/politiclaw-summary markdown — the agent can retune either without a plugin rebuild.

## Parameters

This tool takes no parameters.

## Raw Schema

```json
{
  "type": "object",
  "properties": {}
}
```
