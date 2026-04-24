/**
 * Best-effort mapping from free-form user text ("global warming",
 * "guns", "choice", "war in Iran") onto one of the canonical kebab-case
 * issue slugs the rest of the plugin expects.
 *
 * Returns `matchedCanonical: true` only when a synonym was hit. A novel
 * issue (no synonym match) still gets a usable kebab-case slug so the
 * caller can decide whether to persist it as-is or flag "this isn't one
 * of our canonical issues — keep it?" to the user.
 *
 * Iteration is first-match-wins in insertion order. Narrower buckets
 * (region-specific foreign policy, drug policy, trade policy) are listed
 * before broader ones (foreign-policy, defense-spending) so that
 * "war in Iran" resolves to middle-east-policy rather than getting
 * collapsed into defense-spending. Edit ordering with that in mind.
 */

const CANONICAL_SYNONYMS: Record<string, readonly string[]> = {
  "affordable-housing": [
    "affordable housing",
    "housing",
    "rent",
    "renters",
    "zoning",
    "lihtc",
    "home prices",
  ],
  climate: [
    "climate",
    "climate change",
    "global warming",
    "clean energy",
    "renewable energy",
    "carbon",
    "emissions",
    "environment",
  ],
  "energy-policy": [
    "oil",
    "gas drilling",
    "natural gas",
    "drilling",
    "pipeline",
    "pipelines",
    "fracking",
    "fossil fuels",
    "nuclear power",
    "nuclear energy",
    "anwr",
    "keystone xl",
    "energy independence",
  ],
  healthcare: [
    "healthcare",
    "health care",
    "medicare",
    "medicaid",
    "insurance",
    "aca",
    "obamacare",
    "single payer",
    "public option",
  ],
  immigration: [
    "immigration",
    "immigrants",
    "border",
    "asylum",
    "daca",
    "citizenship",
    "dreamers",
  ],
  "gun-policy": [
    "guns",
    "gun",
    "firearm",
    "firearms",
    "second amendment",
    "2a",
    "gun control",
    "gun rights",
  ],
  "reproductive-rights": [
    "abortion",
    "reproductive",
    "reproductive rights",
    "choice",
    "pro-choice",
    "pro choice",
    "pro-life",
    "pro life",
    "dobbs",
    "roe",
    "plan b",
    "ivf",
    "contraception",
  ],
  "lgbtq-rights": [
    "lgbtq",
    "lgbt",
    "lgbtqia",
    "gay rights",
    "trans rights",
    "transgender",
    "marriage equality",
    "same sex marriage",
    "gender affirming care",
    "gender-affirming care",
    "queer rights",
  ],
  "labor-rights": [
    "labor",
    "unions",
    "union",
    "minimum wage",
    "wages",
    "workers",
    "worker rights",
    "collective bargaining",
    "right to work",
    "nlrb",
  ],
  "tax-policy": [
    "taxes",
    "tax",
    "tax policy",
    "wealth tax",
    "corporate tax",
    "irs",
    "estate tax",
    "capital gains",
  ],
  "trade-policy": [
    "tariff",
    "tariffs",
    "trade war",
    "trade policy",
    "trade deal",
    "free trade",
    "nafta",
    "usmca",
    "imports",
    "exports",
    "wto",
  ],
  "middle-east-policy": [
    "iran",
    "iranian",
    "israel",
    "israeli",
    "palestine",
    "palestinian",
    "gaza",
    "west bank",
    "saudi arabia",
    "saudis",
    "yemen",
    "houthis",
    "syria",
    "iraq",
    "hamas",
    "hezbollah",
    "two state solution",
  ],
  "ukraine-russia-policy": [
    "ukraine",
    "ukrainian",
    "russia",
    "russian",
    "putin",
    "kyiv",
    "donbas",
    "crimea",
    "ukraine aid",
  ],
  "china-policy": [
    "china",
    "chinese government",
    "ccp",
    "taiwan",
    "xi jinping",
    "south china sea",
    "tiktok ban",
  ],
  "foreign-policy": [
    "foreign policy",
    "foreign affairs",
    "state department",
    "diplomacy",
    "treaty",
    "treaties",
    "nato",
    "united nations",
    "sanctions",
    "foreign aid",
    "international affairs",
    "alliances",
  ],
  "defense-spending": [
    "defense",
    "military",
    "pentagon",
    "defense spending",
    "military spending",
    "defense budget",
    "military budget",
    "dod",
  ],
  "voting-rights": [
    "voting",
    "voting rights",
    "elections",
    "voter id",
    "mail in voting",
    "gerrymandering",
  ],
  education: [
    "education",
    "schools",
    "public schools",
    "student loans",
    "college",
    "universities",
    "teachers",
  ],
  "criminal-justice": [
    "criminal justice",
    "police",
    "policing",
    "prisons",
    "incarceration",
    "sentencing",
    "bail reform",
  ],
  "drug-policy": [
    "marijuana",
    "cannabis",
    "weed legalization",
    "opioids",
    "opioid crisis",
    "drug war",
    "war on drugs",
    "drug decriminalization",
    "psychedelics",
    "fentanyl",
  ],
  "tech-regulation": [
    "big tech",
    "antitrust",
    "section 230",
    "social media regulation",
    "content moderation",
    "ai regulation",
    "ai safety",
    "artificial intelligence",
    "platform regulation",
  ],
  "crypto-policy": [
    "crypto",
    "cryptocurrency",
    "bitcoin",
    "ethereum",
    "stablecoin",
    "stablecoins",
    "blockchain",
    "central bank digital currency",
    "cbdc",
  ],
  "social-security": [
    "social security",
    "ssi",
    "ssa",
    "retirement age",
    "social security benefits",
  ],
  "veterans-affairs": [
    "veterans",
    "veterans affairs",
    "va benefits",
    "gi bill",
    "vha",
  ],
  "privacy-rights": [
    "surveillance",
    "fisa",
    "nsa surveillance",
    "data privacy",
    "warrantless",
    "patriot act",
  ],
};

export type NormalizedIssue = {
  slug: string;
  matchedCanonical: boolean;
};

export function normalizeFreeformIssue(rawText: string): NormalizedIssue | null {
  const text = rawText.trim();
  if (text.length === 0) return null;
  const lower = text.toLowerCase();

  for (const [slug, synonyms] of Object.entries(CANONICAL_SYNONYMS)) {
    for (const synonym of synonyms) {
      if (containsWholePhrase(lower, synonym)) {
        return { slug, matchedCanonical: true };
      }
    }
  }

  return {
    slug: toKebabSlug(text),
    matchedCanonical: false,
  };
}

export function canonicalIssueSlugs(): string[] {
  return Object.keys(CANONICAL_SYNONYMS);
}

function containsWholePhrase(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? " " : haystack[idx - 1]!;
  const afterIdx = idx + needle.length;
  const after = afterIdx >= haystack.length ? " " : haystack[afterIdx]!;
  return !/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after);
}

function toKebabSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
