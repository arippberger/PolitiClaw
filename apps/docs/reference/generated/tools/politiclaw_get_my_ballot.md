# politiclaw_get_my_ballot

- Label: Preview ballot logistics and contests for your saved address
- Group: Ballot and election prep
- Source file: `packages/politiclaw-plugin/src/tools/ballot.ts`

## Description

Fetch election logistics and contest rows from Google Civic voterInfoQuery. Requires plugins.politiclaw.apiKeys.googleCivic with the Civic Information API enabled. Coverage labels are honest: this tool lists what Google returns today and marks each race PARTIAL unless fuller structured coverage is available.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `refresh` | no | `boolean` | When true, bypass the cached Google Civic snapshot and re-query voterInfoQuery. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "refresh": {
      "description": "When true, bypass the cached Google Civic snapshot and re-query voterInfoQuery.",
      "type": "boolean"
    }
  }
}
```
