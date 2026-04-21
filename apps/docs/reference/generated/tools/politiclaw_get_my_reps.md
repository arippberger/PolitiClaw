# politiclaw_get_my_reps

- Label: Get my federal representatives
- Group: Representatives and alignment
- Source file: `packages/politiclaw-plugin/src/tools/reps.ts`

## Description

Resolve federal representatives (US Senate + US House) for the saved address. Reads cached reps by default; pass refresh=true to re-fetch. Uses the zero-key local shapefile pipeline by default, or Geocodio when configured.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `refresh` | no | `boolean` | When true, bypass the cache and re-fetch from the source adapter. Default: false. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "refresh": {
      "description": "When true, bypass the cache and re-fetch from the source adapter. Default: false.",
      "type": "boolean"
    }
  }
}
```
