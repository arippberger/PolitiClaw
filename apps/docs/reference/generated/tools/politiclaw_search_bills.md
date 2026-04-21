# politiclaw_search_bills

- Label: Search recent federal bills
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/bills.ts`

## Description

List recent federal bills from api.congress.gov (tier 1). Filter by congress, billType, updateDate range, and title substring. Requires plugins.politiclaw.apiKeys.apiDataGov. Cached for 6h; pass refresh=true to re-fetch.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `congress` | no | `integer` | Congress number. Defaults to the 119th (2025-2027). |
| `billType` | no | `string` | Bill type (HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES). |
| `titleContains` | no | `string` | Case-insensitive substring match on bill title. |
| `fromDateTime` | no | `string` | ISO-8601 lower bound on bill updateDate. Example: 2026-01-01T00:00:00Z. |
| `toDateTime` | no | `string` | ISO-8601 upper bound on bill updateDate. |
| `limit` | no | `integer` | Max bills to return (1-50). |
| `refresh` | no | `boolean` | When true, bypass the cache and re-fetch. |

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
      "description": "Bill type (HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES).",
      "type": "string"
    },
    "titleContains": {
      "description": "Case-insensitive substring match on bill title.",
      "type": "string"
    },
    "fromDateTime": {
      "description": "ISO-8601 lower bound on bill updateDate. Example: 2026-01-01T00:00:00Z.",
      "type": "string"
    },
    "toDateTime": {
      "description": "ISO-8601 upper bound on bill updateDate.",
      "type": "string"
    },
    "limit": {
      "minimum": 1,
      "maximum": 50,
      "description": "Max bills to return (1-50).",
      "type": "integer"
    },
    "refresh": {
      "description": "When true, bypass the cache and re-fetch.",
      "type": "boolean"
    }
  }
}
```
