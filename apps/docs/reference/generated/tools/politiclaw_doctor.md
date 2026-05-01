# politiclaw_doctor

- Label: Diagnose PolitiClaw install health
- Group: Operations and diagnostics
- Source file: `packages/politiclaw-plugin/src/tools/doctor.ts`

## Description

Run a local health check: schema version, SQLite integrity, preferences, API keys, reps cache, monitoring cron status, and skill-override status (which bundled skills are shadowed by user files in ~/.agents/skills or ~/.openclaw/skills). Returns a structured report with ok/warn/fail per check plus an actionable hint for every non-ok result. Read-only — never modifies state. Call this first when something looks broken.

## Parameters

This tool takes no parameters.

## Raw Schema

```json
{
  "type": "object",
  "properties": {}
}
```
