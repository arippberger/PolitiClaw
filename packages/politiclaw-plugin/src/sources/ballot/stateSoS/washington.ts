import type { StateSoSAdapterOptions, StateSoSBallotAdapter } from "./types.js";
import { createUnimplementedStateSoSAdapter } from "./unimplemented.js";

export function createWashingtonStateSoSBallotAdapter(
  options: StateSoSAdapterOptions = {},
): StateSoSBallotAdapter {
  return createUnimplementedStateSoSAdapter({
    ...options,
    stateCode: "WA",
    adapterId: "stateSoS.washington",
    electionPortalUrl: "https://www.sos.wa.gov/elections",
  });
}
