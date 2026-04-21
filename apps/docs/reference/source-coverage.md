# Source Coverage

The generated source coverage page is the source of truth for what the runtime can actually call today.

- [Generated Source Coverage](./generated/source-coverage)
- [Generated Source Coverage JSON](./generated/source-coverage.json)

## Why This Page Exists

PolitiClaw currently ships a broader config schema than the runtime implementation. This reference prevents the docs from overstating support by showing which providers are:

- implemented now
- wired as optional upgrades
- transport-pending
- declared only

When you need the exact provider matrix, use the generated page rather than prose summaries.
