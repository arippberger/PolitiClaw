# politiclaw_research_candidate

- Label: Look up FEC candidate finance totals + tier-5 bio
- Group: Candidate research and outreach
- Source file: `packages/politiclaw-plugin/src/tools/researchCandidate.ts`

## Description

Research a federal candidate (President, Senate, House) via FEC OpenFEC plus an optional LLM-search bio. Pass `candidateId` (e.g. H8CA12345) for a full per-cycle totals summary with an attached bio; pass `name` for a fuzzy search that returns up to 5 FEC matches (no bio on the search path — re-run by `candidateId` to pull one). Dollar amounts come only from FEC (tier 1) — industry rollups, donor identities, and independent expenditures are intentionally out of scope until an OpenSecrets key lands. The bio is tier-5 by default and only reaches tier 1/2 when every citation is a primary-government or neutral civic-infrastructure domain. Requires plugins.politiclaw.apiKeys.apiDataGov (same key as api.congress.gov).

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `candidateId` | no | `string` | FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint. |
| `name` | no | `string` | Free-text candidate name query. Used when `candidateId` is absent; returns up to 5 FEC candidate matches for disambiguation. |
| `cycle` | no | `integer` | Optional four-digit election cycle (e.g. 2024) to filter searches to active candidates for that cycle. |
| `office` | no | `"H" \| "S" \| "P"` | Optional office filter — H (House), S (Senate), P (President). |
| `state` | no | `string` | Optional two-letter state filter (uppercased before the FEC call). |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "candidateId": {
      "description": "FEC candidate id (e.g. `H8CA12345`). Preferred when known — routes straight to the totals endpoint.",
      "type": "string"
    },
    "name": {
      "description": "Free-text candidate name query. Used when `candidateId` is absent; returns up to 5 FEC candidate matches for disambiguation.",
      "type": "string"
    },
    "cycle": {
      "description": "Optional four-digit election cycle (e.g. 2024) to filter searches to active candidates for that cycle.",
      "type": "integer"
    },
    "office": {
      "description": "Optional office filter — H (House), S (Senate), P (President).",
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
      "description": "Optional two-letter state filter (uppercased before the FEC call).",
      "type": "string"
    }
  }
}
```
