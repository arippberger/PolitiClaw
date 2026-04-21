# politiclaw_get_bill_details

- Label: Fetch a single federal bill
- Group: Bills and votes
- Source file: `packages/politiclaw-plugin/src/tools/bills.ts`

## Description

Fetch one bill's full detail (sponsors, subjects, summary, latest action) from api.congress.gov (tier 1). Accepts either a canonical billId (e.g. '119-hr-1234') or congress + billType + number. Requires plugins.politiclaw.apiKeys.apiDataGov.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `billId` | no | `string` | Canonical bill id: '&lt;congress&gt;-&lt;billType&gt;-&lt;number&gt;', e.g. '119-hr-1234'. |
| `congress` | no | `integer` |  |
| `billType` | no | `string` |  |
| `number` | no | `string` |  |
| `refresh` | no | `boolean` |  |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "billId": {
      "description": "Canonical bill id: '<congress>-<billType>-<number>', e.g. '119-hr-1234'.",
      "type": "string"
    },
    "congress": {
      "minimum": 1,
      "type": "integer"
    },
    "billType": {
      "type": "string"
    },
    "number": {
      "type": "string"
    },
    "refresh": {
      "type": "boolean"
    }
  }
}
```
