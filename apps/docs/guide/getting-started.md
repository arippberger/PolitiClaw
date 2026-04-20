# Getting Started

PolitiClaw ships as an OpenClaw plugin package inside this workspace. The public docs site is a separate static app, so plugin runtime changes and docs hosting stay isolated from each other.

## Install the plugin locally

From the repository root:

```bash
npm install
openclaw plugins install ./packages/politiclaw-plugin --link
```

The `--link` flag is the best fit during development because it keeps OpenClaw pointed at your working copy.

## Verify the workspace

Run the workspace checks from the repo root:

```bash
npm run build
npm run typecheck
npm run test
```

## Preview the docs site

```bash
npm run docs:dev
```

This starts the VitePress app from `apps/docs`.

## Minimum configuration

PolitiClaw expects at least one API key:

- `plugins.politiclaw.apiKeys.apiDataGov` is required for Congress.gov and FEC-backed features.

Some features need additional keys:

- `plugins.politiclaw.apiKeys.googleCivic` is required for ballot lookup.
- `plugins.politiclaw.apiKeys.geocodio` is optional when you want API-based reps lookup instead of local shapefiles.

OpenClaw reads plugin config through its normal plugin settings flow, using the schema shipped in `openclaw.plugin.json`.
