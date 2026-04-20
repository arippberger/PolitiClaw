import type { StateSoSAdapterOptions, StateSoSBallotAdapter } from "./types.js";
import { createUnimplementedStateSoSAdapter } from "./unimplemented.js";

export function createCaliforniaStateSoSBallotAdapter(
  options: StateSoSAdapterOptions = {},
): StateSoSBallotAdapter {
  return createUnimplementedStateSoSAdapter({
    ...options,
    stateCode: "CA",
    adapterId: "stateSoS.california",
    electionPortalUrl: "https://www.sos.ca.gov/elections",
  });
}
