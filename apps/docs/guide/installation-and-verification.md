# Installation and Verification

## Local Install

From the repository root:

```bash
npm install
openclaw plugins install ./packages/politiclaw-plugin --link
```

The linked install is the best fit while the plugin and docs are evolving in the same workspace.

## Workspace Checks

Run the standard checks from the repository root:

```bash
npm run build
npm run typecheck
npm run test
```

If you are changing docs metadata or generated reference pages, also run:

```bash
npm run docs:generate
npm run docs:check
```

## Docs Preview

Start the VitePress app from the workspace root:

```bash
npm run docs:dev
```

## Runtime Verification

After the plugin is installed inside OpenClaw, use the runtime tools to verify the real environment:

1. Run [`politiclaw_configure`](../reference/generated/tools/politiclaw_configure) with your address.
2. Run [`politiclaw_doctor`](../reference/generated/tools/politiclaw_doctor).
3. If you plan to use zero-key rep lookup, `politiclaw_configure` primes the local cache as part of rep resolution.
4. Fetch current reps with [`politiclaw_get_my_reps`](../reference/generated/tools/politiclaw_get_my_reps) if you want a direct verification pass.

## What Counts As Healthy

A healthy local install usually looks like this:

- Build, typecheck, and tests pass from the workspace root.
- The docs generator is clean or has been refreshed.
- The doctor tool reports working storage and a current schema version.
- Missing keys show up as actionable configuration gaps, not stack traces.
