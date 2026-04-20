import type { StateSoSAdapterOptions, StateSoSBallotAdapter } from "./types.js";
import { createUnimplementedStateSoSAdapter } from "./unimplemented.js";

export function createOhioStateSoSBallotAdapter(
  options: StateSoSAdapterOptions = {},
): StateSoSBallotAdapter {
  return createUnimplementedStateSoSAdapter({
    ...options,
    stateCode: "OH",
    adapterId: "stateSoS.ohio",
    electionPortalUrl: "https://www.ohiosos.gov/elections/",
  });
}
