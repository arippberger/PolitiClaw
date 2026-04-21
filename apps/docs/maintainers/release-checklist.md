# Release Checklist

Use this checklist when a runtime change could affect public docs.

1. Update the runtime source of truth first.
2. Regenerate docs with `npm run docs:generate`.
3. Run `npm run docs:check`.
4. Re-read any affected guide or maintainer pages for overclaims.
5. Verify the relevant generated pages changed in the expected way.
6. Build the docs site before merging or releasing.

## Changes That Usually Need A Docs Refresh

- tool additions, removals, or renamed parameters
- config-schema changes
- source coverage changes
- cron template changes
- skill additions or renamed skill directories
- storage migrations
