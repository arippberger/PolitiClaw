# politiclaw_check_upcoming_votes

- Label: Check upcoming votes + bill changes since last run
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/monitoring.ts`

## Description

Run the change-detection loop: fetch recent federal bills + upcoming committee events from api.congress.gov (tier 1), compare each against the persisted snapshot, and return only items that are new or have materially changed since the last check. Bill changes are scored against declared issue stances when any are set. A second invocation on unchanged data returns an empty delta. Requires plugins.politiclaw.apiKeys.apiDataGov.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `congress` | no | `integer` | Congress number. Defaults to the 119th (2025-2027). |
| `billType` | no | `string` | Restrict bill check to HR, S, HJRES, etc. |
| `fromDateTime` | no | `string` | ISO-8601 lower bound passed to both bills (updateDate) and events (startDateTime). |
| `toDateTime` | no | `string` | ISO-8601 upper bound. |
| `chamber` | no | `"House" \| "Senate" \| "Joint"` |  |
| `limit` | no | `integer` | Max bills to examine (1-50). |
| `refresh` | no | `boolean` | When true, bypass the 6h bills-list cache and re-fetch from api.congress.gov. |

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
    "billType": {
      "description": "Restrict bill check to HR, S, HJRES, etc.",
      "type": "string"
    },
    "fromDateTime": {
      "description": "ISO-8601 lower bound passed to both bills (updateDate) and events (startDateTime).",
      "type": "string"
    },
    "toDateTime": {
      "description": "ISO-8601 upper bound.",
      "type": "string"
    },
    "chamber": {
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
          "const": "Joint",
          "type": "string"
        }
      ]
    },
    "limit": {
      "minimum": 1,
      "maximum": 50,
      "description": "Max bills to examine (1-50).",
      "type": "integer"
    },
    "refresh": {
      "description": "When true, bypass the 6h bills-list cache and re-fetch from api.congress.gov.",
      "type": "boolean"
    }
  }
}
```
