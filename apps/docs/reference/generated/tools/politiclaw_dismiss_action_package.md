# politiclaw_dismiss_action_package

- Label: Dismiss or flag an action package
- Group: Monitoring and cadence
- Source file: `packages/politiclaw-plugin/src/tools/actionMoments.ts`

## Description

Record user feedback on an action package. verdict='useful' marks it used, 'not_now' suppresses the same target for 7 days, 'stop' permanently stops offering packages for the same (trigger, target tuple). Prefer this over politiclaw_mute unless the user explicitly wants to silence the bill/rep/issue.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `packageId` | yes | `integer` | Action package id to dismiss. |
| `verdict` | yes | `"useful" \| "not_now" \| "stop"` | useful = used it. not_now = hide for 7 days. stop = never offer this target again. |
| `note` | no | `string` | Optional free-text reason — stored verbatim for later review. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "packageId",
    "verdict"
  ],
  "properties": {
    "packageId": {
      "minimum": 1,
      "description": "Action package id to dismiss.",
      "type": "integer"
    },
    "verdict": {
      "description": "useful = used it. not_now = hide for 7 days. stop = never offer this target again.",
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
      "description": "Optional free-text reason — stored verbatim for later review.",
      "type": "string"
    }
  }
}
```
