import type { AdapterResult } from "../../common/types.js";
import type { NormalizedBallotSnapshot } from "../types.js";

export type StateSoSBallotAdapter = {
  id: string;
  stateCode: string;
  fetchVoterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>>;
};

export type StateSoSAdapterOptions = {
  fetcher?: typeof fetch;
};

