# politiclaw_action_moments

- Label: List or dismiss open action-package offers
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/actionMoments.ts`

## Description

Manage the open action packages — outreach drafts (letter/call), reminders, and election-prep prompts — that the classifier has queued as optional offers. Pass action='list' (no other params required) to see what is currently queued; the list is offer-not-push, nothing has been sent. Pass action='dismiss' with packageId and verdict to record feedback: verdict='useful' marks it used, 'not_now' suppresses the same target for 7 days, 'stop' permanently stops offering packages for the same (trigger, target). Prefer this over politiclaw_mutes unless the user explicitly wants to silence the bill/rep/issue.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `action` | yes | `"list" \| "dismiss"` | What to do: 'list' returns open action packages (no other params required); 'dismiss' records user feedback on a single package (requires packageId and verdict). |
| `limit` | no | `integer` | Used only with action='list'. Max packages to return. Defaults to 25. |
| `packageId` | no | `integer` | Required for action='dismiss'. Action package id to dismiss. |
| `verdict` | no | `"useful" \| "not_now" \| "stop"` | Required for action='dismiss'. useful = used it. not_now = hide for 7 days. stop = never offer this target again. |
| `note` | no | `string` | Optional (action='dismiss' only). Free-text reason — stored verbatim for later review. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "description": "What to do: 'list' returns open action packages (no other params required); 'dismiss' records user feedback on a single package (requires packageId and verdict).",
      "anyOf": [
        {
          "const": "list",
          "type": "string"
        },
        {
          "const": "dismiss",
          "type": "string"
        }
      ]
    },
    "limit": {
      "minimum": 1,
      "maximum": 100,
      "description": "Used only with action='list'. Max packages to return. Defaults to 25.",
      "type": "integer"
    },
    "packageId": {
      "minimum": 1,
      "description": "Required for action='dismiss'. Action package id to dismiss.",
      "type": "integer"
    },
    "verdict": {
      "description": "Required for action='dismiss'. useful = used it. not_now = hide for 7 days. stop = never offer this target again.",
      "anyOf": [
        {
          "const": "useful",
          "type": "string"
        },
        {
          "const": "not_now",
          "type": "string"
        },
        {
          "const": "stop",
          "type": "string"
        }
      ]
    },
    "note": {
      "description": "Optional (action='dismiss' only). Free-text reason — stored verbatim for later review.",
      "type": "string"
    }
  }
}
```
