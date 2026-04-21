# politiclaw_download_shapefiles

- Label: Download local rep lookup data
- Group: Representatives and alignment
- Source file: `packages/politiclaw-plugin/src/tools/downloadShapefiles.ts`

## Description

Download and cache the zero-key congressional district + legislator data under the plugin state directory.

## Parameters

| Name | Required | Type | Description |
| --- | --- | --- | --- |
| `force` | no | `boolean` | When true, re-download and overwrite the cached shapefile bundle. |

## Raw Schema

```json
{
  "type": "object",
  "properties": {
    "force": {
      "description": "When true, re-download and overwrite the cached shapefile bundle.",
      "type": "boolean"
    }
  }
}
```
