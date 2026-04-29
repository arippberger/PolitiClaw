import type { IssueStanceRow } from "../domain/preferences/types.js";
import { canonicalIssueSlugs } from "../domain/preferences/normalize.js";
import { QUIZ_QUESTIONS, type QuizQuestion } from "../domain/preferences/quizQuestions.js";

const SUGGESTED_OPENING_PROMPTS = [
  "What political issues have been on your mind lately?",
  "Are there any recent news stories or legislation that sparked strong feelings for you?",
  "Which parts of everyday life feel most affected by decisions in Washington or your state capital?",
  "Is there a policy debate where you feel the government is moving in the wrong direction? What would better look like to you?",
];

type ChoicePrompt = {
  mode: "choice";
  question: string;
  options: Array<{ id: "conversation" | "quiz"; label: string; description: string }>;
};

type ConversationHandoff = {
  mode: "conversation";
  suggestedOpeningPrompts: readonly string[];
  canonicalIssueSlugs: readonly string[];
  existingStances: readonly IssueStanceRow[];
};

type QuizHandoff = {
  mode: "quiz";
  questions: readonly QuizQuestion[];
  existingStances: readonly IssueStanceRow[];
};

export type StartOnboardingResult = ChoicePrompt | ConversationHandoff | QuizHandoff;

export function renderChoicePrompt(existing: readonly IssueStanceRow[]): string {
  const lines: string[] = [
    "Before PolitiClaw can tell you when your reps are (or aren't) representing you, it needs to know what you actually care about. How would you like to declare those stances?",
    "",
    "  1. **Conversation** — I'll ask open-ended questions about what matters to you, paraphrase each one back, then persist your stances.",
    "  2. **Quiz** — I'll walk you through ~12 short policy questions with support/oppose/no-strong-view options, then ask how much each matters to you.",
    "",
    "Reply with \"conversation\" or \"quiz\".",
  ];
  if (existing.length > 0) {
    lines.push("", `You already have ${existing.length} declared stance${existing.length === 1 ? "" : "s"}; either mode will skip issues you've already answered unless you want to revise them.`);
  }
  return lines.join("\n");
}

const BROAD_CLUSTERS: ReadonlyArray<{ name: string; slugs: readonly string[] }> = [
  {
    name: "environment",
    slugs: [
      "climate",
      "environmental-protection",
      "public-lands-and-natural-resources",
      "water-resources-development",
      "energy",
      "animals",
    ],
  },
  {
    name: "economy",
    slugs: [
      "taxation",
      "labor-and-employment",
      "foreign-trade-and-international-finance",
      "affordable-housing",
      "housing-and-community-development",
      "economics-and-public-finance",
      "finance-and-financial-sector",
    ],
  },
  {
    name: "foreign policy",
    slugs: [
      "international-affairs",
      "armed-forces-and-national-security",
      "middle-east-policy",
      "ukraine-russia-policy",
      "china-policy",
    ],
  },
  {
    name: "social issues",
    slugs: [
      "reproductive-rights",
      "lgbtq-rights",
      "gun-policy",
      "civil-rights-and-liberties",
      "voting-rights",
    ],
  },
];

function renderConversationHandoff(handoff: ConversationHandoff): string {
  const lines = [
    "Conversation onboarding ready.",
    "",
    "Suggested opening prompts for the skill to draw from (pick one, don't recite all):",
    ...handoff.suggestedOpeningPrompts.map((prompt) => `  - ${prompt}`),
    "",
    "How to handle the user's responses:",
    "",
    "  1. **Probe before bucketing.** When the user names a broad topic (the clusters below), DO NOT immediately pick a canonical slug. Ask a clarifying question listing the relevant sub-issues so the user can narrow it. Example: user says \"environmental issues\" — ask whether they're thinking climate, public lands and wilderness, water, pollution / EPA enforcement, energy, or something else specific. Save a stance only after the user has narrowed the topic OR explicitly confirmed multiple buckets are wanted.",
    "",
    "  2. **Capture the user's specific concern as `note` and their verbatim phrasing as `sourceText`** every time you call politiclaw_issue_stances with action='set'. Letters, call scripts, and rep reports surface `note`, so put the actual concern there (e.g., \"BWCA wilderness federal protections\"), not just a paraphrase of the slug name. The slug is the bucket; the note is the nuance.",
    "",
    "  3. **One concern can become multiple stances.** \"Environmental issues, especially BWCA\" should call politiclaw_issue_stances with action='set' twice — once for `public-lands-and-natural-resources` (note: BWCA wilderness federal protections) and once for `environmental-protection` (note: federal environmental regulation more broadly). Always paraphrase each stance back before saving.",
    "",
    "  4. Map clear free-text to a canonical slug from the list below. Novel issues are allowed (a kebab-case fallback slug will be generated) but flag them and ask the user to confirm before saving — they often map to a canonical you should suggest.",
    "",
    "Broad topic clusters that REQUIRE probing before bucketing:",
    ...BROAD_CLUSTERS.map(
      (cluster) => `  - ${cluster.name}: ${cluster.slugs.join(", ")}`,
    ),
    "",
    `Canonical slug set: ${handoff.canonicalIssueSlugs.join(", ")}.`,
  ];
  if (handoff.existingStances.length > 0) {
    lines.push(
      "",
      `Existing stances (skip or revise as the user requests):`,
      ...handoff.existingStances.map((s) => {
        const noteSuffix = s.note ? ` — ${s.note}` : "";
        return `  - ${s.issue}: ${s.stance} (weight ${s.weight})${noteSuffix}`;
      }),
    );
  }
  return lines.join("\n");
}

function renderQuizHandoff(handoff: QuizHandoff): string {
  const lines = [
    `Quiz onboarding ready — ${handoff.questions.length} questions.`,
    "",
    "Ask them sequentially. For each, present the three answer labels; only ask the weight follow-up after support or oppose. \"No strong view\" does not persist a neutral stance unless the user explicitly asks to record one. After all answers, read back the collected stances before committing with politiclaw_issue_stances (action='set').",
    "",
    "Questions:",
  ];
  for (const q of handoff.questions) {
    lines.push(`  ${q.id} (${q.canonicalIssueSlug}): ${q.prompt}`);
    lines.push(
      `      support → ${q.supportAnswer} | oppose → ${q.opposeAnswer} | neutral → ${q.neutralAnswer}`,
    );
  }
  if (handoff.existingStances.length > 0) {
    lines.push(
      "",
      `Existing stances (skip the matching questions unless the user wants to revise):`,
      ...handoff.existingStances.map(
        (s) => `  - ${s.issue}: ${s.stance} (weight ${s.weight})`,
      ),
    );
  }
  return lines.join("\n");
}

export function buildStartOnboardingResult(
  input: { mode?: "conversation" | "quiz" },
  existingStances: readonly IssueStanceRow[],
): StartOnboardingResult {
  if (input.mode === "conversation") {
    return {
      mode: "conversation",
      suggestedOpeningPrompts: SUGGESTED_OPENING_PROMPTS,
      canonicalIssueSlugs: canonicalIssueSlugs(),
      existingStances,
    };
  }
  if (input.mode === "quiz") {
    const answeredSlugs = new Set(existingStances.map((s) => s.issue));
    const questions = QUIZ_QUESTIONS.filter(
      (q) => !answeredSlugs.has(q.canonicalIssueSlug),
    );
    return {
      mode: "quiz",
      questions: questions.length > 0 ? questions : QUIZ_QUESTIONS,
      existingStances,
    };
  }
  return {
    mode: "choice",
    question: "Which onboarding style would the user prefer?",
    options: [
      {
        id: "conversation",
        label: "Conversation",
        description:
          "Open-ended prompts about what the user cares about, paraphrased back, then persisted.",
      },
      {
        id: "quiz",
        label: "Quiz",
        description:
          "Sequential multiple-choice questions across ~12 canonical issues plus a weight follow-up.",
      },
    ],
  };
}

export function renderStartOnboardingOutput(result: StartOnboardingResult): string {
  if (result.mode === "choice") {
    return renderChoicePrompt([]);
  }
  if (result.mode === "conversation") return renderConversationHandoff(result);
  return renderQuizHandoff(result);
}
