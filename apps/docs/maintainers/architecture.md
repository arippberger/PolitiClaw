# Architecture

## Current Runtime Shape

The current plugin is centered on tool registration plus a few supporting layers:

- `packages/politiclaw-plugin/src/index.ts` wires storage and registers the runtime tool registry.
- `packages/politiclaw-plugin/src/tools/*` exposes the public tool surface.
- `packages/politiclaw-plugin/src/domain/*` holds the behavior behind those tools.
- `packages/politiclaw-plugin/src/sources/*` contains provider adapters and resolver selection logic.
- `packages/politiclaw-plugin/src/storage/*` owns SQLite, key-value helpers, and migrations.
- `packages/politiclaw-plugin/src/cron/*` owns the plugin-managed monitoring templates and gateway adapter logic.
- `packages/politiclaw-plugin/skills/*` contains the companion skill prompts.

## What The Runtime Does Not Currently Include

The current implementation does not register HTTP routes, a dashboard, or a long-running background service. The public docs should not claim those surfaces exist until code actually lands.

## Docs-Relevant Source Of Truth

The living-docs system is intentionally tied to code-owned metadata:

- `packages/politiclaw-plugin/src/docs/toolRegistry.ts`
- `packages/politiclaw-plugin/src/docs/sourceCoverage.ts`
- `packages/politiclaw-plugin/scripts/docs.mts`

That setup keeps the runtime registry and the generated reference pages aligned.
