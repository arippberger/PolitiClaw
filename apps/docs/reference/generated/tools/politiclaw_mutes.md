# politiclaw_mutes

- Label: Manage monitoring alert mutes (add, remove, list)
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/mutes.ts`

## Description

Manage suppression of monitoring alerts for specific bills, reps, or issues. Pass action='add' with kind+ref (and optional reason) to start suppressing — re-adding the same target refreshes the optional reason and timestamp. Pass action='remove' with kind+ref to unsuppress. Pass action='list' for every active mute, newest first. Prefer politiclaw_action_moments with verdict='not_now' or 'stop' when you only want to dismiss a single offer rather than silence the bill/rep/issue entirely.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `action` | yes | `"add" \| "remove" \| "list"` | What to do: 'add' to start suppressing a target, 'remove' to unsuppress, 'list' to see every active mute. 'add' and 'remove' both require kind+ref; 'list' takes no other params. |
| `kind` | no | `"bill" \| "rep" \| "issue"` | Required for action='add' or action='remove'. What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug). |
| `ref` | no | `string` | Required for action='add' or action='remove'. Bill id, bioguide id, or issue slug. Issue refs are normalized to lowercase kebab-case. |
| `reason` | no | `string` | Optional (action='add' only). Short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "description": "What to do: 'add' to start suppressing a target, 'remove' to unsuppress, 'list' to see every active mute. 'add' and 'remove' both require kind+ref; 'list' takes no other params.",
      "anyOf": [
        {
          "const": "add",
          "type": "string"
        },
        {
          "const": "remove",
          "type": "string"
        },
        {
          "const": "list",
          "type": "string"
        }
      ]
    },
    "kind": {
      "description": "Required for action='add' or action='remove'. What to mute: 'bill' (by bill id like '119-hr-1234'), 'rep' (by bioguide id), or 'issue' (by issue slug).",
      "anyOf": [
        {
          "const": "bill",
          "type": "string"
        },
        {
          "const": "rep",
          "type": "string"
        },
        {
          "const": "issue",
          "type": "string"
        }
      ]
    },
    "ref": {
      "description": "Required for action='add' or action='remove'. Bill id, bioguide id, or issue slug. Issue refs are normalized to lowercase kebab-case.",
      "type": "string"
    },
    "reason": {
      "description": "Optional (action='add' only). Short note about why this is muted (e.g. 'followup-2026-05'). Stored for your own reference; not rendered in alerts.",
      "type": "string"
    }
  }
}
```
