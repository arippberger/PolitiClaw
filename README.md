# PolitiClaw Workspace

PolitiClaw is a local-first OpenClaw plugin for legislation, representatives, ballots, and action-oriented civic research.

## Install

To use PolitiClaw as an OpenClaw plugin, install it into a running gateway:

```bash
openclaw plugins install @politiclaw/politiclaw
```

See [`packages/politiclaw-plugin/README.md`](packages/politiclaw-plugin/README.md) for the first-run checklist, API keys, and skills overrides.

## Workspace layout

- `packages/politiclaw-plugin` contains the OpenClaw plugin package.
- `apps/docs` contains the VitePress docs site source.

## Contributing

Install dependencies from the workspace root:

```bash
npm install
```

Common commands:

```bash
npm run build
npm run typecheck
npm run test
npm run docs:dev
```

Install the plugin into OpenClaw from a local checkout:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

If you only want to work on the plugin package directly, the package-specific commands still run from `packages/politiclaw-plugin`.
