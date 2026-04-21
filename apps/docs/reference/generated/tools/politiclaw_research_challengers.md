# politiclaw_research_challengers

- Label: Compare incumbents and challengers by FEC finance totals
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/researchChallengers.ts`

## Description

For each stored rep (or a specific one via repId), look up every federal candidate filed for that race this cycle and render a side-by-side FEC finance comparison. Dollar amounts come only from FEC (tier 1). Pass `cycle` for historical comparisons. Requires plugins.politiclaw.apiKeys.apiDataGov. Call politiclaw_get_my_reps first if no reps are stored.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `repId` | no | `string` | Optional: focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn. |
| `cycle` | no | `integer` | Optional four-digit election cycle (e.g. 2026). Defaults to the current year if even, otherwise next year. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "repId": {
      "description": "Optional: focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn.",
      "type": "string"
    },
    "cycle": {
      "description": "Optional four-digit election cycle (e.g. 2026). Defaults to the current year if even, otherwise next year.",
      "type": "integer"
    }
  }
}
```
