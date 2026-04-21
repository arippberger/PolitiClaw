# Generated State Ballot Coverage

This page is generated from the current `stateSoS` adapter files.

Structured state ballot adapter count: 6.

| State | Code | Source File |
| --- | --- | --- |
| California | `CA` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/california.ts` |
| Colorado | `CO` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/colorado.ts` |
| Florida | `FL` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/florida.ts` |
| Michigan | `MI` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/michigan.ts` |
| Ohio | `OH` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/ohio.ts` |
| Washington | `WA` | `packages/politiclaw-plugin/src/sources/ballot/stateSoS/washington.ts` |

Resolver order today:

1. Try a matching built-in state adapter.
2. Fall back to Google Civic when a configured key is available.
3. Return an actionable unavailable result when neither path can answer the request.
