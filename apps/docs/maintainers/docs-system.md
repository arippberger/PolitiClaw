# Docs System

## Principle

Published PolitiClaw docs have two layers:

- Hand-written guide and maintainer pages in `apps/docs`
- Generated factual reference pages in `apps/docs/reference/generated`

If a fact can be derived from code, it should come from the generator instead of being copied into prose.

## Current Inputs

The generator reads from:

- the runtime tool registry
- the explicit source coverage catalog
- the plugin config schema
- the cron templates
- the skill front matter
- a real migrated in-memory SQLite database

## Hosting assumption

The published site uses VitePress `cleanUrls`, so the hosting layer must also serve generated `.html` files at extensionless paths like `/reference/tools` and `/guide/getting-started`. On Vercel, keep `apps/docs/vercel.json` aligned with that expectation.

## Commands

Run these from the repository root:

```bash
npm run docs:generate
npm run docs:check
```

`docs:generate` refreshes generated reference artifacts. `docs:check` fails on drift and also fails when a hand-written page points at the hidden planning path or presents a declared-only integration as live.

## Writing Guidance

When editing hand-written pages:

- Link to generated reference pages instead of duplicating volatile lists.
- Do not rely on the hidden planning set for current product claims.
- Do not present declared-only integrations as supported.
- Use current runtime code, not intent, as the deciding source.
