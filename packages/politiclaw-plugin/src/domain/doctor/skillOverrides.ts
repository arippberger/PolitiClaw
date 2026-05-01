import { existsSync, readdirSync } from "fs";
import { homedir } from "os";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

export type SkillOverrideSource = "bundled" | "personal-agent" | "managed-local";

export type SkillOverrideStatus = {
  skill: string;
  source: SkillOverrideSource;
  overridePath?: string;
};

export type DetectSkillOverridesDeps = {
  homeDir?: string;
  bundledSkillsDir?: string;
  exists?: (path: string) => boolean;
  listBundledSkills?: (dir: string) => string[];
};

// Compiled output for this module ships at
// dist/domain/doctor/skillOverrides.js, so three levels up lands at the
// package root where skills/ lives. Tests inject bundledSkillsDir to avoid
// depending on the published layout.
function defaultBundledSkillsDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "..", "skills");
}

function defaultListBundledSkills(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
    .filter((entry) => existsSync(join(dir, entry.name, "SKILL.md")))
    .map((entry) => entry.name)
    .sort();
}

export function detectSkillOverrides(
  deps: DetectSkillOverridesDeps = {},
): SkillOverrideStatus[] {
  const home = deps.homeDir ?? homedir();
  const exists = deps.exists ?? existsSync;
  const list = deps.listBundledSkills ?? defaultListBundledSkills;
  const bundledDir = deps.bundledSkillsDir ?? defaultBundledSkillsDir();

  const personalRoot = join(home, ".agents", "skills");
  const managedRoot = join(home, ".openclaw", "skills");

  return list(bundledDir).map((skill) => {
    const personalPath = join(personalRoot, skill, "SKILL.md");
    if (exists(personalPath)) {
      return { skill, source: "personal-agent", overridePath: personalPath };
    }
    const managedPath = join(managedRoot, skill, "SKILL.md");
    if (exists(managedPath)) {
      return { skill, source: "managed-local", overridePath: managedPath };
    }
    return { skill, source: "bundled" };
  });
}
