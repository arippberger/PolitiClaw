# politiclaw_research_finance

- Label: Research candidate finance — single candidate or side-by-side challengers
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/researchFinance.ts`

## Description

Federal campaign-finance research from FEC OpenFEC (tier 1). Pass mode='candidate' with `candidateId` (e.g. H8CA12345) for a full per-cycle totals summary with an attached LLM-search bio; pass `name` for a fuzzy search returning up to 5 FEC matches (no bio on the search path — re-run by `candidateId` to pull one). Pass mode='challengers' to compare each stored rep's filed challengers side-by-side (uses politiclaw_get_my_reps results; supports optional `repId` and `cycle` filters). Dollar amounts come only from FEC — industry rollups, donor identities, and independent expenditures are out of scope until an OpenSecrets key lands. The bio is tier-5 by default and only reaches tier 1/2 when every citation is a primary-government or neutral civic-infrastructure domain. Requires plugins.entries.politiclaw.config.apiKeys.apiDataGov (same key as api.congress.gov).

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `mode` | yes | `"candidate" \| "challengers"` | 'candidate' looks up FEC finance + bio for one federal candidate (requires candidateId or name). 'challengers' compares each stored rep's filed challengers side-by-side (uses politiclaw_get_my_reps results; supports optional repId+cycle filters). |
| `candidateId` | no | `string` | Used only with mode='candidate'. FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint. |
| `name` | no | `string` | Used only with mode='candidate'. Free-text candidate name query when `candidateId` is absent; returns up to 5 FEC matches for disambiguation. |
| `cycle` | no | `integer` | Optional four-digit election cycle (e.g. 2024). For mode='candidate' filters searches to active candidates for that cycle. For mode='challengers' defaults to the current year if even, otherwise next year. |
| `office` | no | `"H" \| "S" \| "P"` | Used only with mode='candidate'. Optional office filter — H (House), S (Senate), P (President). |
| `state` | no | `string` | Used only with mode='candidate'. Optional two-letter state filter (uppercased before the FEC call). |
| `repId` | no | `string` | Used only with mode='challengers'. Focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn. |

## Raw Schema

```json
{
  "type": "object",
  "required": [
    "mode"
  ],
  "properties": {
    "mode": {
      "description": "'candidate' looks up FEC finance + bio for one federal candidate (requires candidateId or name). 'challengers' compares each stored rep's filed challengers side-by-side (uses politiclaw_get_my_reps results; supports optional repId+cycle filters).",
      "anyOf": [
        {
          "const": "candidate",
          "type": "string"
        },
        {
          "const": "challengers",
          "type": "string"
        }
      ]
    },
    "candidateId": {
      "minLength": 1,
      "description": "Used only with mode='candidate'. FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint.",
      "type": "string"
    },
    "name": {
      "minLength": 1,
      "description": "Used only with mode='candidate'. Free-text candidate name query when `candidateId` is absent; returns up to 5 FEC matches for disambiguation.",
      "type": "string"
    },
    "cycle": {
      "minimum": 1900,
      "maximum": 2100,
      "description": "Optional four-digit election cycle (e.g. 2024). For mode='candidate' filters searches to active candidates for that cycle. For mode='challengers' defaults to the current year if even, otherwise next year.",
      "type": "integer"
    },
    "office": {
      "description": "Used only with mode='candidate'. Optional office filter — H (House), S (Senate), P (President).",
      "anyOf": [
        {
          "const": "H",
          "type": "string"
        },
        {
          "const": "S",
          "type": "string"
        },
        {
          "const": "P",
          "type": "string"
        }
      ]
    },
    "state": {
      "pattern": "^[A-Za-z]{2}$",
      "description": "Used only with mode='candidate'. Optional two-letter state filter (uppercased before the FEC call).",
      "type": "string"
    },
    "repId": {
      "description": "Used only with mode='challengers'. Focus on one stored rep (from politiclaw_get_my_reps). When absent, compares challengers for every stored rep in one turn.",
      "type": "string"
    }
  }
}
```
