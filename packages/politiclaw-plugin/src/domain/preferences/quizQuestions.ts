/**
 * Canonical quiz question bank for the onboarding quiz mode.
 *
 * Each question maps 1:1 to an `IssueStance.issue` slug so that the
 * onboarding tool can persist answers through the existing
 * `politiclaw_set_issue_stance` path without re-interpreting free text.
 *
 * Rules for editing this bank (enforced by tests in ./quizQuestions.test.ts):
 *   - Every question has a non-empty kebab-case slug.
 *   - Every question has a prompt and three distinct answer labels
 *     (support / oppose / neutral) plus a weight prompt.
 *   - No slug appears more than twice so the quiz does not over-weight a
 *     single issue.
 *
 * The prompts intentionally avoid partisan jargon ("Medicare for All",
 * "MAGA", "defund") and instead describe the policy direction in plain
 * terms the user can map to their own position without feeling pushed.
 */

export type QuizQuestion = {
  /** Stable id, also used as the sort key. */
  id: string;
  /** Kebab-case slug that will be persisted as `IssueStance.issue`. */
  canonicalIssueSlug: string;
  /** User-facing prompt. */
  prompt: string;
  /** Label shown when the user picks the support direction. */
  supportAnswer: string;
  /** Label shown when the user picks the oppose direction. */
  opposeAnswer: string;
  /** Label shown for the neutral / skip branch. */
  neutralAnswer: string;
  /** Follow-up prompt asked only after support/oppose, to set weight 1–5. */
  weightPrompt: string;
};

export const QUIZ_QUESTIONS: readonly QuizQuestion[] = [
  {
    id: "q-housing",
    canonicalIssueSlug: "affordable-housing",
    prompt:
      "How do you feel about federal action to expand affordable-housing supply (tax credits, construction grants, zoning preemption)?",
    supportAnswer: "Favor more of it",
    opposeAnswer: "Favor less of it",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-climate",
    canonicalIssueSlug: "climate",
    prompt:
      "How do you feel about federal investment in clean-energy infrastructure and emissions limits?",
    supportAnswer: "Favor more of it",
    opposeAnswer: "Favor less of it",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-healthcare",
    canonicalIssueSlug: "healthcare",
    prompt:
      "How do you feel about expanding the federal role in healthcare coverage (public option, subsidy expansion, Medicare/Medicaid scope)?",
    supportAnswer: "Favor expansion",
    opposeAnswer: "Favor contraction",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-immigration",
    canonicalIssueSlug: "immigration",
    prompt:
      "How do you feel about expanding legal immigration pathways and a path to status for long-residing undocumented people?",
    supportAnswer: "Favor expansion",
    opposeAnswer: "Favor restriction",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-guns",
    canonicalIssueSlug: "gun-policy",
    prompt:
      "How do you feel about additional federal firearms restrictions (universal background checks, assault-weapon limits, red-flag laws)?",
    supportAnswer: "Favor more restriction",
    opposeAnswer: "Favor less restriction",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-abortion",
    canonicalIssueSlug: "reproductive-rights",
    prompt:
      "How do you feel about federal protection of abortion access across state lines?",
    supportAnswer: "Favor protecting access",
    opposeAnswer: "Favor restricting access",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-labor",
    canonicalIssueSlug: "labor-rights",
    prompt:
      "How do you feel about strengthening collective-bargaining protections and raising the federal minimum wage?",
    supportAnswer: "Favor strengthening",
    opposeAnswer: "Favor rolling back",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-taxes",
    canonicalIssueSlug: "tax-policy",
    prompt:
      "How do you feel about raising federal taxes on top earners and large corporations to fund public programs?",
    supportAnswer: "Favor raising",
    opposeAnswer: "Favor lowering or holding",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-defense",
    canonicalIssueSlug: "defense-spending",
    prompt:
      "How do you feel about growing the federal defense budget above inflation?",
    supportAnswer: "Favor growth",
    opposeAnswer: "Favor reduction",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-voting",
    canonicalIssueSlug: "voting-rights",
    prompt:
      "How do you feel about federal voting-access protections (automatic registration, mail-in access, voter-ID standards)?",
    supportAnswer: "Favor expanding access",
    opposeAnswer: "Favor stricter requirements",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-education",
    canonicalIssueSlug: "education",
    prompt:
      "How do you feel about federal public-education funding and student-loan relief?",
    supportAnswer: "Favor more funding / relief",
    opposeAnswer: "Favor less federal involvement",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-criminal-justice",
    canonicalIssueSlug: "criminal-justice",
    prompt:
      "How do you feel about federal criminal-justice reform (sentencing reform, police accountability standards, decarceration)?",
    supportAnswer: "Favor reform",
    opposeAnswer: "Favor status quo or tougher enforcement",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-foreign-policy",
    canonicalIssueSlug: "foreign-policy",
    prompt:
      "How do you feel about active US engagement abroad through alliances, treaties, and foreign aid (versus a more restrained posture)?",
    supportAnswer: "Favor engagement",
    opposeAnswer: "Favor restraint",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-middle-east",
    canonicalIssueSlug: "middle-east-policy",
    prompt:
      "How do you feel about continued US military and financial involvement in Middle East conflicts (Israel/Gaza, Iran, Yemen)?",
    supportAnswer: "Favor continued involvement",
    opposeAnswer: "Favor scaling back",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-ukraine-russia",
    canonicalIssueSlug: "ukraine-russia-policy",
    prompt:
      "How do you feel about continued US military and financial aid to Ukraine in its war with Russia?",
    supportAnswer: "Favor continued aid",
    opposeAnswer: "Favor reducing or ending aid",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-trade",
    canonicalIssueSlug: "trade-policy",
    prompt:
      "How do you feel about using tariffs and trade restrictions to protect domestic industry (versus prioritizing free-trade agreements)?",
    supportAnswer: "Favor tariffs / protection",
    opposeAnswer: "Favor free trade",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-energy",
    canonicalIssueSlug: "energy-policy",
    prompt:
      "How do you feel about expanding domestic oil, gas, and nuclear production (separate from emissions policy)?",
    supportAnswer: "Favor expansion",
    opposeAnswer: "Favor restriction",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-tech",
    canonicalIssueSlug: "tech-regulation",
    prompt:
      "How do you feel about stricter federal regulation of large tech platforms and AI systems (antitrust, content moderation rules, AI safety mandates)?",
    supportAnswer: "Favor more regulation",
    opposeAnswer: "Favor less regulation",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-crypto",
    canonicalIssueSlug: "crypto-policy",
    prompt:
      "How do you feel about a clear federal framework that legitimizes cryptocurrency and stablecoins (versus tighter restrictions or enforcement)?",
    supportAnswer: "Favor a permissive framework",
    opposeAnswer: "Favor tighter restrictions",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-drug",
    canonicalIssueSlug: "drug-policy",
    prompt:
      "How do you feel about federal decriminalization or legalization of cannabis and a public-health approach to other drugs?",
    supportAnswer: "Favor decriminalization",
    opposeAnswer: "Favor current enforcement",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-lgbtq",
    canonicalIssueSlug: "lgbtq-rights",
    prompt:
      "How do you feel about federal protections for LGBTQ people in employment, housing, and healthcare (including gender-affirming care)?",
    supportAnswer: "Favor expanding protections",
    opposeAnswer: "Favor narrowing protections",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
  {
    id: "q-social-security",
    canonicalIssueSlug: "social-security",
    prompt:
      "How do you feel about preserving current Social Security benefits even if it requires raising the payroll-tax cap or other revenue?",
    supportAnswer: "Favor preserving benefits",
    opposeAnswer: "Favor benefit cuts or eligibility changes",
    neutralAnswer: "No strong view",
    weightPrompt: "How important is this to you on a 1–5 scale?",
  },
];
