# politiclaw_pause_monitoring

- Label: Pause all PolitiClaw monitoring cron jobs
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/monitoringSetup.ts`

## Description

Disable every PolitiClaw-owned cron job (names prefixed "politiclaw.weekly_summary", etc). Leaves user-authored and other-plugin jobs alone. Idempotent; jobs already paused render as 'already paused'.

## Parameters

This tool takes no parameters.

## Raw Schema

```json
{
  "type": "object",
  "properties": {}
}
```
