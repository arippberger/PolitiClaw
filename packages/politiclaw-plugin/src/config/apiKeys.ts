export const API_KEY_NAMES = [
  "apiDataGov",
  "geocodio",
  "openStates",
  "legiscan",
  "openSecrets",
  "followTheMoney",
  "voteSmart",
  "democracyWorks",
  "cicero",
  "ballotReady",
  "googleCivic",
] as const;

export type ApiKeyName = (typeof API_KEY_NAMES)[number];
