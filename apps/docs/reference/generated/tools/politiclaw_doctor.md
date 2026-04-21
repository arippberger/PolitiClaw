# politiclaw_doctor

- Label: Diagnose PolitiClaw install health
- Group: Operations and diagnostics
- Source file: `packages/politiclaw-plugin/src/tools/doctor.ts`

## Description

Run a local health check: schema version, SQLite integrity, preferences, API keys, reps cache, and monitoring cron status. Returns a structured report with ok/warn/fail per check plus an actionable hint for every non-ok result. Read-only — never modifies state. Call this first when something looks broken.

## Parameters

This tool takes no parameters.

## Raw Schema

```json
{
  "type": "object",
  "properties": {}
}
```
