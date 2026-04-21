# Config Schema

The generated config schema page is the source of truth for current keys, whether each one is wired today, and which files back that status.

- [Generated Config Schema](./generated/config-schema)
- [Generated Config Schema JSON](./generated/config-schema.json)

## How To Read The Status Columns

- `implemented`: the runtime uses this key today.
- `optional_upgrade`: the runtime uses this key when you configure it.
- `schema_only`: the key ships in the schema, but the integration is not wired today.

Use this page together with [Source Coverage](./source-coverage) whenever you need to tell the difference between declared configuration and live runtime behavior.
