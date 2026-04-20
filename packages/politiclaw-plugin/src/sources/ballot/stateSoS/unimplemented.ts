import { unavailable } from "../../common/types.js";
import type { StateSoSBallotAdapter, StateSoSAdapterOptions } from "./types.js";

type UnimplementedStateSoSAdapterOptions = StateSoSAdapterOptions & {
  stateCode: string;
  adapterId: string;
  electionPortalUrl: string;
};

export function createUnimplementedStateSoSAdapter(
  options: UnimplementedStateSoSAdapterOptions,
): StateSoSBallotAdapter {
  return {
    id: options.adapterId,
    stateCode: options.stateCode,
    async fetchVoterInfo() {
      return unavailable(
        options.adapterId,
        `Structured ballot transport for ${options.stateCode} is not wired yet`,
        `Use the official state election portal for now: ${options.electionPortalUrl}`,
      );
    },
  };
}

