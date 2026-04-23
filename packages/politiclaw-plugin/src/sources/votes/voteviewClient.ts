/**
 * Thin typed wrapper over voteview.com's undocumented web-app API.
 *
 * Two endpoints are used:
 *   - `/api/search?q=<query>&api=1` — enumerate roll-calls. For the current
 *     (119th) Senate the whole Congress fits in one response (~750 entries,
 *     ~530KB) and `nextId` comes back `0`; pagination is not needed yet.
 *   - `/api/download?rollcall_id=<RS...>` — full detail for one roll-call,
 *     including the embedded `votes[]` array (per-member positions keyed by
 *     `bioguide_id`, `icpsr`, and `lis_member_id`).
 *
 * Both endpoints occasionally return an error envelope
 * `{ errormessage, errormeta, apitype }` without the `rollcalls` key; the
 * client surfaces those as `{ kind: "error", ... }` so the adapter can mark
 * the vote as `skipped_unavailable` and keep going.
 *
 * Transient 429 / 5xx responses are retried with jittered exponential backoff.
 * Tests inject `retries: 0` to keep fetch counts predictable.
 */

const VOTEVIEW_BASE = "https://voteview.com";

type Fetcher = typeof fetch;

export type VoteviewClientOptions = {
  fetcher?: Fetcher;
  baseUrl?: string;
  /** Max retry attempts on 429 / 5xx / network error (default 2). */
  retries?: number;
  /** Base delay in ms for exponential backoff (default 250). */
  backoffBaseMs?: number;
  /** Injected sleep for tests; defaults to setTimeout-based sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Jitter fraction 0-1 applied to backoff delay (default 0.3). */
  jitter?: number;
  /** Random source for jitter (injectable for tests). */
  random?: () => number;
};

export type VoteviewSearchRollcall = {
  id: string;
  congress: number;
  chamber: string;
  rollnumber: number;
  date: string;
  bill_number?: string | null;
  vote_title?: string;
  vote_document_text?: string;
  vote_question_text?: string;
  question?: string;
  vote_result?: string;
  yea_count?: number;
  nay_count?: number;
};

export type VoteviewSearchResponse = {
  recordcount: number;
  recordcountTotal: number;
  rollcalls: VoteviewSearchRollcall[];
  nextId?: number;
};

export type VoteviewMemberVote = {
  bioguide_id?: string;
  icpsr?: number;
  lis_member_id?: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  member_full?: string;
  state?: string;
  state_abbrev?: string;
  party?: string;
  party_code?: number;
  party_short_name?: string;
  district?: string | number;
  vote?: string;
  cast_str?: string;
  paired_flag?: number;
};

export type VoteviewRollcallDetail = VoteviewSearchRollcall & {
  description?: string;
  clerk_rollnumber?: number;
  votes?: VoteviewMemberVote[];
};

export type VoteviewDownloadResponse = {
  rollcalls?: VoteviewRollcallDetail[];
  errormessage?: string;
  errormeta?: unknown;
};

export type VoteviewFetchOk<T> = { kind: "ok"; body: T };
export type VoteviewFetchErr = {
  kind: "error";
  reason: string;
  /** HTTP status if we got one; 0 for network / parse failures. */
  status: number;
};

export type VoteviewClient = {
  searchRollcalls(
    query: string,
  ): Promise<VoteviewFetchOk<VoteviewSearchResponse> | VoteviewFetchErr>;
  getRollcall(
    rollcallId: string,
  ): Promise<VoteviewFetchOk<VoteviewRollcallDetail> | VoteviewFetchErr>;
};

export function createVoteviewClient(
  opts: VoteviewClientOptions = {},
): VoteviewClient {
  const fetcher = opts.fetcher ?? fetch;
  const baseUrl = opts.baseUrl ?? VOTEVIEW_BASE;
  const retries = opts.retries ?? 2;
  const backoffBaseMs = opts.backoffBaseMs ?? 250;
  const sleep =
    opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const jitter = opts.jitter ?? 0.3;
  const random = opts.random ?? Math.random;

  async function fetchWithBackoff<T>(
    url: URL,
  ): Promise<VoteviewFetchOk<T> | VoteviewFetchErr> {
    let lastErr: VoteviewFetchErr = {
      kind: "error",
      reason: "no attempt made",
      status: 0,
    };
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      let response: Response;
      try {
        response = await fetcher(url);
      } catch (err) {
        lastErr = {
          kind: "error",
          reason: `network error: ${(err as Error)?.message ?? "unknown"}`,
          status: 0,
        };
        if (attempt === retries) return lastErr;
        await sleep(backoffDelay(attempt, backoffBaseMs, jitter, random));
        continue;
      }

      if (response.ok) {
        try {
          const body = (await response.json()) as T;
          return { kind: "ok", body };
        } catch {
          return {
            kind: "error",
            reason: "invalid JSON in voteview response",
            status: response.status,
          };
        }
      }

      const retryable = response.status === 429 || response.status >= 500;
      lastErr = {
        kind: "error",
        reason: `voteview http ${response.status}`,
        status: response.status,
      };
      if (!retryable || attempt === retries) return lastErr;
      await sleep(backoffDelay(attempt, backoffBaseMs, jitter, random));
    }
    return lastErr;
  }

  return {
    async searchRollcalls(query: string) {
      const url = new URL(`${baseUrl}/api/search`);
      url.searchParams.set("q", query);
      url.searchParams.set("api", "1");
      return fetchWithBackoff<VoteviewSearchResponse>(url);
    },

    async getRollcall(rollcallId: string) {
      const url = new URL(`${baseUrl}/api/download`);
      url.searchParams.set("rollcall_id", rollcallId);
      const result = await fetchWithBackoff<VoteviewDownloadResponse>(url);
      if (result.kind === "error") return result;
      const body = result.body;
      if (body.errormessage) {
        return {
          kind: "error",
          reason: `voteview: ${body.errormessage}`,
          status: 200,
        };
      }
      const rollcall = body.rollcalls?.[0];
      if (!rollcall) {
        return {
          kind: "error",
          reason: "voteview returned empty rollcalls array",
          status: 200,
        };
      }
      return { kind: "ok", body: rollcall };
    },
  };
}

function backoffDelay(
  attempt: number,
  baseMs: number,
  jitter: number,
  random: () => number,
): number {
  const raw = baseMs * Math.pow(2, attempt);
  const spread = raw * jitter;
  return Math.round(raw + (random() * 2 - 1) * spread);
}
