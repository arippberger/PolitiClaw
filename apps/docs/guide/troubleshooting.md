# Troubleshooting

## The plugin does not install from the repo root anymore

Use the package workspace path instead:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
```

## The ballot tools say Google Civic is missing

Set `plugins.politiclaw.apiKeys.googleCivic` in your OpenClaw plugin configuration. The ballot-specific tools depend on that key.

## Bill or vote tools say api.data.gov is missing

Set `plugins.politiclaw.apiKeys.apiDataGov`. That key is the main dependency for Congress.gov and FEC-backed workflows.

## Representative lookup falls back or fails

If you are not using `geocodio`, make sure the local shapefile workflow has been prepared. If you prefer the API path, add `plugins.politiclaw.apiKeys.geocodio`.

## The docs site will not start

Make sure dependencies are installed from the workspace root, then run:

```bash
npm run docs:dev
```

If `vitepress` is missing, re-run `npm install` from the repository root so the docs workspace dependencies are installed.
