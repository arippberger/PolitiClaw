# politiclaw_resume_monitoring

- Label: Resume paused PolitiClaw monitoring cron jobs
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/monitoringSetup.ts`

## Description

Re-enable every PolitiClaw-owned cron job. Does not re-install jobs that were never created — use politiclaw_setup_monitoring for that. Idempotent; jobs already active render as 'already active'.

## Parameters

This tool takes no parameters.

## Raw Schema

```json
{
  "type": "object",
  "properties": {}
}
```
