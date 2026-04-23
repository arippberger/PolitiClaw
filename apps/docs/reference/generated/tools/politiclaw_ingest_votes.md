# politiclaw_ingest_votes

- Label: Ingest recent congressional roll-call votes
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/voteIngest.ts`

## Description

Sweep primary roll-call sources and persist recent votes (plus per-member positions keyed by bioguide id) into the plugin-private DB. House: api.congress.gov `/house-vote` (tier 1, requires plugins.politiclaw.apiKeys.apiDataGov). Senate: voteview.com `/api/search` + `/api/download` (tier 2, zero-key). Idempotent: unchanged entries (by update_date when available, by memberCount>0 otherwise) skip the detail fetch. Use chamber='Both' (default) to ingest both chambers in one call.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `chamber` | no | `"House" \| "Senate" \| "Both"` | Which chamber to sweep. Defaults to 'Both'. House uses api.congress.gov (tier 1); Senate uses voteview.com (tier 2). |
| `congress` | no | `integer` | Congress number. Defaults to the 119th (2025-2027). |
| `session` | no | `integer` | Session within the congress (1 or 2). If omitted, no session filter is applied — the most recent votes across both sessions are returned. |
| `limit` | no | `integer` | Max list-level roll-call entries to sweep per chamber (1-100). House ingest may trigger an extra detail+members fetch per vote against the api.data.gov 5000/hr quota. Senate ingest fetches the full /api/search response once then issues one /api/download per vote. |
| `offset` | no | `integer` |  |
| `force` | no | `boolean` | When true, re-fetch detail+members for every listed vote even when its update_date is unchanged. Use for schema backfills or to pick up Voteview corrections (Voteview does not expose an update timestamp). |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "chamber": {
      "description": "Which chamber to sweep. Defaults to 'Both'. House uses api.congress.gov (tier 1); Senate uses voteview.com (tier 2).",
      "anyOf": [
        {
          "const": "House",
          "type": "string"
        },
        {
          "const": "Senate",
          "type": "string"
        },
        {
          "const": "Both",
          "type": "string"
        }
      ]
    },
    "congress": {
      "minimum": 1,
      "description": "Congress number. Defaults to the 119th (2025-2027).",
      "type": "integer"
    },
    "session": {
      "minimum": 1,
      "maximum": 2,
      "description": "Session within the congress (1 or 2). If omitted, no session filter is applied — the most recent votes across both sessions are returned.",
      "type": "integer"
    },
    "limit": {
      "minimum": 1,
      "maximum": 100,
      "description": "Max list-level roll-call entries to sweep per chamber (1-100). House ingest may trigger an extra detail+members fetch per vote against the api.data.gov 5000/hr quota. Senate ingest fetches the full /api/search response once then issues one /api/download per vote.",
      "type": "integer"
    },
    "offset": {
      "minimum": 0,
      "type": "integer"
    },
    "force": {
      "description": "When true, re-fetch detail+members for every listed vote even when its update_date is unchanged. Use for schema backfills or to pick up Voteview corrections (Voteview does not expose an update timestamp).",
      "type": "boolean"
    }
  }
}
```
