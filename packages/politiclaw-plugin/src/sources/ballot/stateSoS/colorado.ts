import type { StateSoSAdapterOptions, StateSoSBallotAdapter } from "./types.js";
import { createUnimplementedStateSoSAdapter } from "./unimplemented.js";

export function createColoradoStateSoSBallotAdapter(
  options: StateSoSAdapterOptions = {},
): StateSoSBallotAdapter {
  return createUnimplementedStateSoSAdapter({
    ...options,
    stateCode: "CO",
    adapterId: "stateSoS.colorado",
    electionPortalUrl: "https://www.sos.state.co.us/pubs/elections/main.html",
  });
}
