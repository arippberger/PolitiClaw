# politiclaw_issue_stances

- Label: Manage declared issue stances (set, list, delete)
- Group: Configuration and preferences
- Source file: `packages/politiclaw-plugin/src/tools/issueStances.ts`

## Description

Manage the user's declared positions on policy issues. These drive bill alignment scoring and rep scoring. Pass action='set' with issue+stance (and optional 1-5 weight, optional free-text 'note' paraphrasing the user's specific concern, and optional 'sourceText' preserving their verbatim phrasing) to upsert — re-running with the same issue overwrites the previous stance. Pass action='list' to return every declared stance ordered by weight (no other params required). Pass action='delete' with issue to remove a stance. For first-time setup or full reconfiguration, prefer politiclaw_configure.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `action` | yes | `"set" \| "list" \| "delete"` | What to do: 'set' upserts a stance (requires issue+stance, optional weight); 'list' returns every declared stance ordered by weight (no other params); 'delete' removes one stance (requires issue). |
| `issue` | no | `string` | Required for action='set' and action='delete'. Issue label or slug. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing'). |
| `stance` | no | `"support" \| "oppose" \| "neutral"` | Required for action='set'. The user's declared position on the issue. |
| `weight` | no | `integer` | Optional (action='set' only). How strongly the user cares (1-5). Defaults to 3. |
| `note` | no | `string` | Optional (action='set' only). Short paraphrase of the user's specific concern within this issue bucket (e.g. 'BWCA wilderness federal protections' for the 'public-lands-and-natural-resources' slug). Surfaced in letters, call scripts, and rep reports. |
| `sourceText` | no | `string` | Optional (action='set' only). Verbatim user phrasing that prompted this stance, persisted alongside the row for later drafting context. Not yet consumed by any rendering path. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "action"
  ],
  "properties": {
    "action": {
      "description": "What to do: 'set' upserts a stance (requires issue+stance, optional weight); 'list' returns every declared stance ordered by weight (no other params); 'delete' removes one stance (requires issue).",
      "anyOf": [
        {
          "const": "set",
          "type": "string"
        },
        {
          "const": "list",
          "type": "string"
        },
        {
          "const": "delete",
          "type": "string"
        }
      ]
    },
    "issue": {
      "description": "Required for action='set' and action='delete'. Issue label or slug. Normalized to lowercase kebab-case (e.g. 'Affordable Housing' → 'affordable-housing').",
      "type": "string"
    },
    "stance": {
      "description": "Required for action='set'. The user's declared position on the issue.",
      "anyOf": [
        {
          "const": "support",
          "type": "string"
        },
        {
          "const": "oppose",
          "type": "string"
        },
        {
          "const": "neutral",
          "type": "string"
        }
      ]
    },
    "weight": {
      "minimum": 1,
      "maximum": 5,
      "description": "Optional (action='set' only). How strongly the user cares (1-5). Defaults to 3.",
      "type": "integer"
    },
    "note": {
      "description": "Optional (action='set' only). Short paraphrase of the user's specific concern within this issue bucket (e.g. 'BWCA wilderness federal protections' for the 'public-lands-and-natural-resources' slug). Surfaced in letters, call scripts, and rep reports.",
      "type": "string"
    },
    "sourceText": {
      "description": "Optional (action='set' only). Verbatim user phrasing that prompted this stance, persisted alongside the row for later drafting context. Not yet consumed by any rendering path.",
      "type": "string"
    }
  }
}
```
