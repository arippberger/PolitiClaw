# politiclaw_list_action_moments

- Label: List open action-package offers
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/actionMoments.ts`

## Description

Return the set of open action packages — outreach drafts (letter/call), reminders, and election-prep prompts — that the classifier has queued as optional offers. The list is offer-not-push: nothing here has been sent, and the user can dismiss each with politiclaw_dismiss_action_package.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `limit` | no | `integer` | Max packages to return. Defaults to 25. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "limit": {
      "minimum": 1,
      "maximum": 100,
      "description": "Max packages to return. Defaults to 25.",
      "type": "integer"
    }
  }
}
```
