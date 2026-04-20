import type { StateSoSAdapterOptions, StateSoSBallotAdapter } from "./types.js";
import { createUnimplementedStateSoSAdapter } from "./unimplemented.js";

export function createMichiganStateSoSBallotAdapter(
  options: StateSoSAdapterOptions = {},
): StateSoSBallotAdapter {
  return createUnimplementedStateSoSAdapter({
    ...options,
    stateCode: "MI",
    adapterId: "stateSoS.michigan",
    electionPortalUrl: "https://www.michigan.gov/sos/elections",
  });
}
