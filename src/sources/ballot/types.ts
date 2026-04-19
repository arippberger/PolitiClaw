/**
 * Adapter-agnostic ballot snapshot from Google Civic voterInfoQuery or future sources.
 */

export type NormalizedBallotContest = {
  /** Google Civic contest type — 'General', 'Primary', referendum types, etc. */
  contestType?: string;
  /** Human office / measure title */
  office?: string;
  /** District label when present */
  districtScope?: string;
  /** referendum title when measure */
  referendumTitle?: string;
  referendumSubtitle?: string;
  referendumUrl?: string;
  candidates: NormalizedBallotCandidate[];
};

export type NormalizedBallotCandidate = {
  name?: string;
  party?: string;
  candidateUrl?: string;
};

export type NormalizedBallotPolling = {
  locationName?: string;
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  pollingHours?: string;
};

export type NormalizedBallotSnapshot = {
  normalizedInput?: {
    line1?: string;
    city?: string;
    state?: string;
    zip?: string;
  };
  election?: {
    id?: string;
    name?: string;
    electionDay?: string;
    ocdDivisionId?: string;
  };
  contests: NormalizedBallotContest[];
  /** First polling location (informative preview). */
  primaryPolling?: NormalizedBallotPolling | null;
  pollingLocationCount: number;
  registrationUrl?: string | null;
  electionAdministrationUrl?: string | null;
};
