# politiclaw_ingest_house_votes

- Label: Ingest recent House roll-call votes
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/voteIngest.ts`

## Description

Sweep api.congress.gov's `/house-vote` endpoint and persist recent House roll-call votes (plus per-member positions keyed by bioguide id) into the plugin-private DB. Idempotent: unchanged entries (by Clerk update_date) skip the detail fetch. Requires plugins.politiclaw.apiKeys.apiDataGov. Senate roll-call votes are not yet served by api.congress.gov, so this tool currently ingests House only.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `congress` | no | `integer` | Congress number. Defaults to the 119th (2025-2027). |
| `session` | no | `integer` | Session within the congress (1 or 2). Defaults to 1. |
| `limit` | no | `integer` | Max list-level roll-call entries to sweep (1-100). Each listed vote may trigger an extra detail+members fetch, so 100 entries can mean up to ~200 api.data.gov calls against the 5000/hr quota. |
| `offset` | no | `integer` |  |
| `force` | no | `boolean` | When true, re-fetch detail+members for every listed vote even when its update_date is unchanged. Use for schema backfills. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "congress": {
      "minimum": 1,
      "description": "Congress number. Defaults to the 119th (2025-2027).",
      "type": "integer"
    },
    "session": {
      "minimum": 1,
      "maximum": 2,
      "description": "Session within the congress (1 or 2). Defaults to 1.",
      "type": "integer"
    },
    "limit": {
      "minimum": 1,
      "maximum": 100,
      "description": "Max list-level roll-call entries to sweep (1-100). Each listed vote may trigger an extra detail+members fetch, so 100 entries can mean up to ~200 api.data.gov calls against the 5000/hr quota.",
      "type": "integer"
    },
    "offset": {
      "minimum": 0,
      "type": "integer"
    },
    "force": {
      "description": "When true, re-fetch detail+members for every listed vote even when its update_date is unchanged. Use for schema backfills.",
      "type": "boolean"
    }
  }
}
```
