# Contributing to PolitiClaw

Thanks for taking the time to contribute. PolitiClaw is a local-first OpenClaw plugin, plus a VitePress docs site, organized as an npm workspace.

## Prerequisites

- Node `>=20` at the workspace root (`>=22.5.0` for the plugin package).
- npm (the workspace uses `package-lock.json` and `npm ci` in CI).
- A working OpenClaw gateway if you want to exercise the plugin end-to-end. See [`packages/politiclaw-plugin/README.md`](packages/politiclaw-plugin/README.md).

## Repo layout

- [`packages/politiclaw-plugin`](packages/politiclaw-plugin) — the `@politiclaw/politiclaw` OpenClaw plugin.
- [`apps/docs`](apps/docs) — the VitePress docs site.
- [`scripts`](scripts) — workspace-level release tooling.

## Getting started

From the workspace root:

```bash
npm install
npm run build
npm run typecheck
npm run test
```

To iterate on the plugin against a local OpenClaw gateway:

```bash
openclaw plugins install ./packages/politiclaw-plugin --link
npm run dev:plugin
```

To preview the docs site locally:

```bash
npm run docs:dev
```

## Common scripts

All scripts run from the workspace root unless noted.

| Script | What it does |
| --- | --- |
| `npm run build` | Builds the plugin and the docs site. |
| `npm run typecheck` | Type-checks the plugin. |
| `npm run lint` | ESLint over the plugin. |
| `npm test` | Runs the plugin's vitest suite (also runs `docs:check` first). |
| `npm run docs:generate` | Regenerates plugin-derived docs pages. |
| `npm run docs:check` | Verifies generated docs are in sync with source. |
| `npm run docs:dev` / `npm run docs:preview` | VitePress dev server / built-site preview. |
| `npm run release:check` | Full pre-release gate: docs check, typecheck, tests, build, runtime smoke, packaging dry-run. This is what CI runs. |

Package-level scripts (run from `packages/politiclaw-plugin`) include `npm run dev`, `npm run test:watch`, `npm run smoke:runtime`, and `npm run pack:check`.

## Branching and commits

- Branch from `main`.
- Use a short, kebab-cased branch name scoped by author or topic (e.g. `fix/senate-ingest-lookback`, `docs/contributing-guide`).
- Commit messages follow the lowercase prefixed style already in the log: `fix:`, `feat:`, `docs:`, `chore:`, `refactor:`, `test:`. Keep the subject under ~72 characters; explain the *why* in the body when it isn't obvious from the diff.
- Keep PRs focused. If a change naturally splits into independent pieces, open them as separate PRs.

## Pull requests

Before opening a PR:

1. Run `npm run release:check` locally. CI runs the same command and a red CI run will block review.
2. If your change touches anything that affects generated docs (tools, skills, schemas), run `npm run docs:generate` and commit the regenerated files. `docs:check` will fail otherwise.
3. If you touched the plugin's runtime entry, public types, or the published `files` set, also run `npm run smoke:runtime` and `npm run pack:check` from `packages/politiclaw-plugin`.

In the PR description:

- Summarize the user-visible change in a few bullets.
- Note any new API keys, config knobs, or migrations.
- List the validation commands you ran.

## Coding conventions

- TypeScript end-to-end, ESM modules.
- Prefer editing existing files over creating new ones.
- No backwards-compatibility shims for code that is not yet released.
- Avoid speculative abstractions; three similar lines beat a premature helper.
- Default to no comments. Add a short comment only when the *why* is non-obvious (a hidden constraint, a workaround, a subtle invariant).
- The plugin must remain local-first: no outbound calls to PolitiClaw-operated services, no telemetry, no network writes. Political data lives in the plugin-private SQLite database under the gateway's state directory and must not leak into shared agent memory.

## Plugin behavior boundaries

PolitiClaw is opinionated about what it will and won't do. When proposing features, keep these boundaries in mind:

- It does not send letters, emails, or any outbound communication on the user's behalf. It drafts; the user sends.
- It does not invent stances or recommend votes. Accountability scoring is grounded in stances the user explicitly declared.
- It does not write to shared agent memory. Plugin state stays in its private SQLite DB.

Changes that would relax any of these need an explicit design discussion in an issue before code review.

## Releases

Releases are driven from GitHub:

1. A maintainer dispatches the **Prepare npm release** workflow with a `patch`/`minor`/`major` bump. It opens a `release/politiclaw-v<version>` PR with the version bumps, regenerated docs, and a green `release:check`.
2. After that PR merges, a maintainer creates a GitHub release tagged `v<version>` from `main`. The **Publish npm package** workflow verifies the tag is on `main`, re-runs `release:check`, and publishes `@politiclaw/politiclaw` to npm with provenance.

Contributors don't need to bump versions or edit `CHANGELOG`-style files by hand.

## Reporting issues

When filing a bug, include:

- OpenClaw gateway version and PolitiClaw plugin version (`/politiclaw-version`).
- The output of `/politiclaw-doctor` if the issue looks like a setup or storage problem.
- Steps to reproduce, expected behavior, and what you actually observed.

Please do not paste raw API keys, full preference exports, or other personal data into issues.

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE). There is no separate CLA.
