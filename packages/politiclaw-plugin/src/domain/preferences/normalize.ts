/**
 * Best-effort mapping from free-form user text ("global warming",
 * "guns", "BWCA protections", "war in Iran") onto a canonical kebab-case
 * issue slug.
 *
 * The taxonomy has two tiers:
 *
 * **Tier 1** — slugs that are kebab-cased Library of Congress Policy
 * Area names (e.g. `public-lands-and-natural-resources`,
 * `environmental-protection`, `taxation`). These match the `policyArea`
 * string the plugin ingests from Congress.gov, so keyword expansion in
 * scoring/alignment.ts hits the bill's policy area substring directly.
 *
 * **Tier 2** — finer slugs preserved where the LoC Policy Area is too
 * coarse to express a user's stance accurately (e.g. `gun-policy`,
 * `middle-east-policy`, `climate`). These match against LoC subjects,
 * bill titles, and summaries via keyword expansion.
 *
 * Iteration is first-match-wins in insertion order. **Tier 2 (narrower)
 * entries come before tier 1 (broader)** so that "war in Iran" resolves
 * to `middle-east-policy` rather than collapsing into
 * `armed-forces-and-national-security`, and "climate" resolves to
 * `climate` rather than `environmental-protection`. Edit ordering with
 * that in mind.
 *
 * Returns `matchedCanonical: true` only when a synonym was hit. A novel
 * issue (no synonym match) still gets a usable kebab-case slug so the
 * caller can decide whether to persist it as-is or flag "this isn't one
 * of our canonical issues — keep it?" to the user.
 */

const CANONICAL_SYNONYMS: Record<string, readonly string[]> = {
  // ----- Tier 2: finer-grained slugs (must come before tier 1) -----
  climate: [
    "climate",
    "climate change",
    "global warming",
    "carbon",
    "emissions",
    "clean energy",
    "renewable energy",
    "decarbonization",
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
  "voting-rights": [
    "voting rights",
    "voter id",
    "mail in voting",
    "mail-in voting",
    "gerrymandering",
    "automatic registration",
  ],
  "affordable-housing": [
    "affordable housing",
    "section 8",
    "lihtc",
    "low income housing",
    "rent control",
    "renters",
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
    "right of privacy",
  ],

  // ----- Tier 1: Library of Congress Policy Areas (slug = kebab-cased
  // Policy Area name) -----
  "agriculture-and-food": [
    "agriculture and food",
    "agriculture",
    "farming",
    "farm bill",
    "farmers",
    "usda",
    "crops",
    "food policy",
    "snap",
    "food stamps",
    "wic",
  ],
  animals: [
    "animal welfare",
    "wildlife protection",
    "endangered species",
    "fish and wildlife",
  ],
  "armed-forces-and-national-security": [
    "armed forces and national security",
    "national security",
    "defense",
    "military",
    "pentagon",
    "defense spending",
    "defense budget",
    "military spending",
    "military budget",
    "dod",
  ],
  "civil-rights-and-liberties": [
    "civil rights and liberties",
    "civil rights",
    "civil liberties",
    "discrimination",
    "racial justice",
    "minority rights",
  ],
  commerce: [
    "small business",
    "trade commission",
    "ftc",
    "consumer protection",
  ],
  "crime-and-law-enforcement": [
    "crime and law enforcement",
    "criminal justice",
    "police",
    "policing",
    "prisons",
    "incarceration",
    "sentencing",
    "bail reform",
    "law enforcement",
  ],
  "economics-and-public-finance": [
    "economics and public finance",
    "budget deficit",
    "national debt",
    "appropriations",
    "federal budget",
    "deficit",
    "debt ceiling",
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
  "emergency-management": [
    "emergency management",
    "disasters",
    "fema",
    "disaster relief",
    "natural disasters",
    "hurricanes",
  ],
  energy: [
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
    "energy policy",
  ],
  "environmental-protection": [
    "environmental protection",
    "environmental issues",
    "environmental regulation",
    "environmental",
    "environment",
    "pollution",
    "epa",
    "clean air act",
    "clean air",
    "clean water act",
    "toxic waste",
    "superfund",
  ],
  families: [
    "child care",
    "paid family leave",
    "parental leave",
    "tanf",
  ],
  "finance-and-financial-sector": [
    "finance and financial sector",
    "wall street",
    "banking regulation",
    "dodd-frank",
    "sec",
    "consumer financial protection",
    "cfpb",
  ],
  "foreign-trade-and-international-finance": [
    "foreign trade and international finance",
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
  "government-operations-and-politics": [
    "government operations and politics",
    "government shutdown",
    "civil service",
    "fec",
    "campaign finance",
    "lobbying",
  ],
  health: [
    "health",
    "healthcare",
    "health care",
    "medicare",
    "medicaid",
    "insurance",
    "aca",
    "obamacare",
    "single payer",
    "public option",
    "prescription drugs",
  ],
  "housing-and-community-development": [
    "housing and community development",
    "housing",
    "rent",
    "zoning",
    "home prices",
    "homelessness",
    "hud",
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
  "international-affairs": [
    "international affairs",
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
    "alliances",
  ],
  "labor-and-employment": [
    "labor and employment",
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
  "native-americans": [
    "native americans",
    "native american",
    "tribal",
    "tribes",
    "indian country",
    "bia",
  ],
  "public-lands-and-natural-resources": [
    "public lands and natural resources",
    "public lands",
    "national parks",
    "wilderness",
    "bwca",
    "boundary waters",
    "national forest",
    "blm",
    "forest service",
    "conservation",
    "national monument",
  ],
  "science-technology-communications": [
    "science technology communications",
    "big tech",
    "antitrust",
    "section 230",
    "social media regulation",
    "content moderation",
    "ai regulation",
    "ai safety",
    "artificial intelligence",
    "platform regulation",
    "broadband",
    "fcc",
    "5g",
    "net neutrality",
  ],
  "social-welfare": [
    "social welfare",
    "welfare",
    "snap benefits",
    "food assistance",
    "anti-poverty",
    "child poverty",
  ],
  taxation: [
    "taxation",
    "taxes",
    "tax",
    "tax policy",
    "wealth tax",
    "corporate tax",
    "irs",
    "estate tax",
    "capital gains",
  ],
  "transportation-and-public-works": [
    "transportation and public works",
    "transportation",
    "highways",
    "infrastructure",
    "transit",
    "amtrak",
    "faa",
    "airlines",
    "self-driving cars",
    "electric vehicles",
  ],
  "water-resources-development": [
    "water resources development",
    "drinking water",
    "water rights",
    "water policy",
    "irrigation",
    "lead pipes",
    "flint water",
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
