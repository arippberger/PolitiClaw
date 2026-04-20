import type { AdapterHealth, AdapterResult, SourceTier } from "../common/types.js";
import { unavailable } from "../common/types.js";
import type {
  NormalizedBallotCandidate,
  NormalizedBallotContest,
  NormalizedBallotPolling,
  NormalizedBallotSnapshot,
} from "./types.js";

type Fetcher = typeof fetch;

const BASE_URL = "https://www.googleapis.com/civicinfo/v2";
const ADAPTER_ID = "googleCivic";
const TIER: SourceTier = 2;

export type GoogleCivicBallotAdapterOptions = {
  apiKey: string;
  fetcher?: Fetcher;
  baseUrl?: string;
  now?: () => number;
};

type GoogleVoterInfoContest = {
  type?: string;
  office?: string | null;
  level?: string;
  district?: { name?: string; scope?: string; type?: string };
  referendumTitle?: string;
  referendumSubtitle?: string;
  referendumUrl?: string;
  candidates?: GoogleCandidate[];
};

type GoogleCandidate = {
  name?: string;
  party?: string;
  candidateUrl?: string;
  channels?: unknown[];
};

type GooglePollingLocation = {
  address?: {
    locationName?: string;
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  pollingHours?: string;
};

type GoogleStateBody = {
  name?: string;
  electionAdministrationBody?: {
    electionRegistrationUrl?: string;
    electionRegistrationConfirmationUrl?: string;
    electionInformationUrl?: string;
  };
};

type GoogleVoterInfoResponse = {
  kind?: string;
  election?: {
    id?: string;
    name?: string;
    electionDay?: string;
    ocdDivisionId?: string;
  };
  normalizedInput?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  pollingLocations?: GooglePollingLocation[];
  earlyVoteSites?: GooglePollingLocation[];
  dropOffLocations?: GooglePollingLocation[];
  contests?: GoogleVoterInfoContest[];
  state?: GoogleStateBody[];
  error?: { code?: number; message?: string; errors?: unknown[] };
};

function hasUsableAddress(location: GooglePollingLocation | undefined): boolean {
  if (!location?.address) return false;
  const { locationName, line1, city, state, zip } = location.address;
  return Boolean(locationName ?? line1 ?? city ?? state ?? zip);
}

function normalizePolling(
  sources: readonly GooglePollingLocation[],
): NormalizedBallotPolling | null {
  const firstUsable = sources.find(hasUsableAddress);
  if (!firstUsable?.address) return null;
  const address = firstUsable.address;
  return {
    locationName: address.locationName,
    line1: address.line1,
    city: address.city,
    state: address.state,
    zip: address.zip,
    pollingHours: firstUsable.pollingHours,
  };
}

function normalizeCandidates(raw?: GoogleCandidate[]): NormalizedBallotCandidate[] {
  if (!raw || raw.length === 0) return [];
  return raw.map((candidate) => ({
    name: candidate.name,
    party: candidate.party,
    candidateUrl: candidate.candidateUrl,
  }));
}

function normalizeContest(contest: GoogleVoterInfoContest): NormalizedBallotContest {
  const officeLabel =
    contest.office && contest.office.trim().length > 0
      ? contest.office
      : contest.referendumTitle;
  return {
    contestType: contest.type,
    office: officeLabel ?? undefined,
    districtScope: contest.district?.name ?? contest.district?.scope,
    referendumTitle: contest.referendumTitle,
    referendumSubtitle: contest.referendumSubtitle,
    referendumUrl: contest.referendumUrl,
    candidates: normalizeCandidates(contest.candidates),
  };
}

export function normalizeGoogleVoterInfoPayload(body: GoogleVoterInfoResponse): NormalizedBallotSnapshot {
  const pollingSources = [
    ...(body.pollingLocations ?? []),
    ...(body.earlyVoteSites ?? []),
    ...(body.dropOffLocations ?? []),
  ];
  const primaryPolling = normalizePolling(pollingSources);
  const admin = body.state?.[0]?.electionAdministrationBody;

  return {
    normalizedInput: body.normalizedInput,
    election: body.election,
    contests: (body.contests ?? []).map(normalizeContest),
    primaryPolling,
    pollingLocationCount: pollingSources.length,
    registrationUrl: admin?.electionRegistrationUrl ?? admin?.electionRegistrationConfirmationUrl ?? null,
    electionAdministrationUrl: admin?.electionInformationUrl ?? null,
  };
}

export function createGoogleCivicBallotAdapter(
  options: GoogleCivicBallotAdapterOptions,
): {
  id: string;
  tier: SourceTier;
  health(): Promise<AdapterHealth>;
  fetchVoterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>>;
} {
  const fetcher = options.fetcher ?? globalThis.fetch.bind(globalThis);
  const baseUrl = options.baseUrl ?? BASE_URL;
  const now = options.now ?? Date.now;

  return {
    id: ADAPTER_ID,
    tier: TIER,

    async health(): Promise<AdapterHealth> {
      return { status: "ok" };
    },

    async fetchVoterInfo(address: string): Promise<AdapterResult<NormalizedBallotSnapshot>> {
      const trimmedAddress = address.trim();
      if (trimmedAddress.length === 0) {
        return unavailable(ADAPTER_ID, "address is empty", "Pass a full street address.");
      }

      const url = new URL(`${baseUrl}/voterinfo`);
      url.searchParams.set("key", options.apiKey);
      url.searchParams.set("address", trimmedAddress);

      let response: Response;
      try {
        response = await fetcher(url.toString(), { method: "GET" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return unavailable(ADAPTER_ID, `Google Civic network error: ${message}`);
      }

      let body: unknown;
      try {
        body = await response.json();
      } catch {
        return unavailable(
          ADAPTER_ID,
          `Google Civic returned non-JSON (HTTP ${response.status})`,
        );
      }

      const payload = body as GoogleVoterInfoResponse;
      if (!response.ok) {
        const hint = payload.error?.message ?? `HTTP ${response.status}`;
        return unavailable(ADAPTER_ID, `Google Civic voterInfoQuery failed: ${hint}`);
      }
      if (payload.error?.message) {
        return unavailable(ADAPTER_ID, `Google Civic error: ${payload.error.message}`);
      }

      const normalized = normalizeGoogleVoterInfoPayload(payload);
      return {
        status: "ok",
        adapterId: ADAPTER_ID,
        tier: TIER,
        data: normalized,
        fetchedAt: now(),
      };
    },
  };
}
