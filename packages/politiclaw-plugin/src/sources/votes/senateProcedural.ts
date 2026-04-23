/**
 * Senate-specific procedural classifier, matched against Voteview's
 * normalized `question` field.
 *
 * Cloture motions, motions to proceed, motions to table, and related
 * chamber mechanics are procedural and excluded from representative
 * alignment by default. Confirmations (`"On the Nomination"`) are
 * substantive and NOT in this list — they carry no `bill_id`, so they
 * drop out of bill-keyed scoring naturally without being misclassified
 * as procedural.
 *
 * `"On the Motion"` is included because Voteview uses it for commit /
 * table / procedural-kind motions whose details only surface in the
 * verbose `vote_question_text`; treating it as procedural is the
 * conservative call for scoring.
 */
export const SENATE_PROCEDURAL_VOTE_QUESTIONS: readonly string[] = [
  "On the Cloture Motion",
  "On Cloture on the Motion to Proceed",
  "On the Motion to Proceed",
  "On the Motion to Table",
  "On the Motion to Discharge",
  "On the Motion to Recommit",
  "On the Motion to Reconsider",
  "On the Motion to Adjourn",
  "On the Motion",
  "On the Decision of the Chair",
  "On the Point of Order",
];

export function isSenateProceduralQuestion(
  voteQuestion: string | undefined,
): boolean {
  if (!voteQuestion) return false;
  const needle = voteQuestion.trim().toLowerCase();
  return SENATE_PROCEDURAL_VOTE_QUESTIONS.some(
    (q) => q.toLowerCase() === needle,
  );
}
