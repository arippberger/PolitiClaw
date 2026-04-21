# State Ballot Coverage

The exact built-in state ballot adapter list is generated from the current `stateSoS` source files.

- [Generated State Ballot Coverage](./generated/state-ballot-coverage)

## Current Behavior

For ballot lookups, the resolver tries a built-in state adapter first when one exists for the saved address. If that path does not answer, the runtime falls back to Google Civic when a key is configured. If neither path can answer, the tool returns an actionable unavailable result.

Use the generated page for the exact current state list and source file paths.
