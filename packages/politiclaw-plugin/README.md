# PolitiClaw Plugin

PolitiClaw is a local-first OpenClaw plugin for tracking legislation, representatives, ballots, and civic action workflows.

## Local install

From the repository root:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

## Development

From this package directory:

```bash
npm run build
npm run typecheck
npm run test
```

From the workspace root, you can also use:

```bash
npm run dev:plugin
```
