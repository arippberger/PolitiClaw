/**
 * Normalizes Voteview's free-text `bill_number` field to the PolitiClaw
 * canonical bill id `<congress>-<type>-<number>` (lowercase).
 *
 * Voteview formats observed in the 119th Senate: `"S5"`, `"HR 1234"`,
 * `"H.R. 1234"`, `"SJRES 60"`, `"S.J.Res. 55"`, `"HCONRES 7"`,
 * `"H.CON.RES. 7"`. The same endpoint also emits nomination ids
 * (`"PN1113"`, `"PN11-22"`) — these are not bills and are rejected so
 * confirmation votes drop out of bill-keyed scoring.
 *
 * Amendment strings (e.g., `"SA 123"`, `"S.Amdt. 14"`) do not currently
 * appear in `bill_number` (they surface only in `vote_title` /
 * `vote_question_text`), so this parser does not attempt to handle them.
 */

const BILL_TYPE_SET = new Set([
  "HR",
  "S",
  "HJRES",
  "SJRES",
  "HCONRES",
  "SCONRES",
  "HRES",
  "SRES",
]);

export function parseVoteviewBillNumber(
  congress: number,
  raw: string | undefined | null,
): string | undefined {
  if (!raw) return undefined;

  const stripped = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (stripped.length === 0) return undefined;

  const match = stripped.match(/^([A-Z]+)(\d+)$/);
  if (!match) return undefined;

  const type = match[1]!;
  const number = match[2]!;
  if (!BILL_TYPE_SET.has(type)) return undefined;

  return `${congress}-${type.toLowerCase()}-${number}`;
}
