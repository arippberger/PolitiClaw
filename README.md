# PolitiClaw Workspace

PolitiClaw is a local-first OpenClaw plugin for legislation, representatives, ballots, and action-oriented civic research. This repository now hosts both the plugin package and the public docs site source in one workspace.

## Workspace layout

- `packages/politiclaw-plugin` contains the OpenClaw plugin package.
- `apps/docs` contains the VitePress docs site source.

## Local development

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

Install the plugin into OpenClaw from its new workspace path:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

If you only want to work on the plugin package directly, the package-specific commands still run from `packages/politiclaw-plugin`.
