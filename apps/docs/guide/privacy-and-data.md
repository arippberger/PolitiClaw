# Privacy and Data

PolitiClaw is designed around local-first storage and explicit scope boundaries.

## Local storage

- Preferences, issue stances, and cached civic data live in plugin-owned local storage.
- The plugin keeps structured data in a local SQLite database under the plugin state directory.
- Small cached values and runtime state use the plugin-scoped key-value store.

## External providers

- Provider calls only happen for the features that need them.
- Optional providers stay optional; missing keys should degrade functionality instead of silently leaking behavior into a different source.
- Official and civic-infrastructure sources are preferred where structured data exists.

## Public docs site separation

The docs site is a static VitePress app that lives beside the plugin in this repository, but it is not served by the plugin and it is not bundled into the plugin package. Hosting the docs separately keeps the public site out of the OpenClaw runtime boundary.

## Operational posture

- The plugin is intended for personal use, one install at a time.
- Monitoring jobs should surface meaningful civic changes, not act like a high-volume alert feed.
- When a feature depends on weaker narrative sources, the output should keep that uncertainty visible.
