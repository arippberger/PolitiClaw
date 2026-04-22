# politiclaw_delete_issue_stance

- Label: Delete a declared issue stance
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/preferences.ts`

## Description

Remove a single declared issue stance by issue slug or label.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `issue` | yes | `string` | Issue slug or label to delete. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "issue"
  ],
  "properties": {
    "issue": {
      "description": "Issue slug or label to delete.",
      "type": "string"
    }
  }
}
```
