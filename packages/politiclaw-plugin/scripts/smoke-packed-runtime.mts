import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceMigrationsDir = join(pluginRoot, "src", "storage", "migrations");
const distMigrationsDir = join(pluginRoot, "dist", "storage", "migrations");
const distToolsDir = join(pluginRoot, "dist", "tools");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sqlFiles(directory: string): string[] {
  return readdirSync(directory).filter((file) => file.endsWith(".sql")).sort();
}

const sourceMigrations = sqlFiles(sourceMigrationsDir);
assert(existsSync(distMigrationsDir), "dist/storage/migrations is missing");
const distMigrations = sqlFiles(distMigrationsDir);
assert(
  distMigrations.length === sourceMigrations.length,
  `dist migration count ${distMigrations.length} does not match source count ${sourceMigrations.length}`,
);

const latestMigration = Math.max(
  ...sourceMigrations.map((file) => Number.parseInt(file.slice(0, 4), 10)),
);

const sqliteModule = await import(
  pathToFileURL(join(pluginRoot, "dist", "storage", "sqlite.js")).href
);
const tempDir = mkdtempSync(join(tmpdir(), "politiclaw-smoke-"));
try {
  const db = sqliteModule.openDb({ dbDir: tempDir });
  const row = db
    .prepare("SELECT MAX(version) AS version FROM schema_version")
    .get() as { version: number | null };
  db.close();
  assert(
    row.version === latestMigration,
    `schema_version ${row.version ?? "null"} did not reach ${latestMigration}`,
  );
} finally {
  rmSync(tempDir, { force: true, recursive: true });
}

const assetsModule = await import(
  pathToFileURL(join(pluginRoot, "dist", "http", "assets.js")).href
);
for (const assetName of ["index.html", "app.js", "style.css"]) {
  const asset = assetsModule.loadDashboardAsset(assetName);
  assert(asset?.body?.length > 0, `dashboard asset ${assetName} did not load`);
}

const removedToolStems = [
  "callScript",
  "draftLetter",
  "explainBallot",
  "prepareForElection",
  "researchCandidate",
  "researchChallengers",
];
const staleToolFiles = readdirSync(distToolsDir).filter((file) =>
  removedToolStems.some((stem) => file.startsWith(`${stem}.`)),
);
assert(
  staleToolFiles.length === 0,
  `stale removed tool build artifacts remain: ${staleToolFiles.join(", ")}`,
);

for (const directory of [
  join(pluginRoot, "dist", "storage", "migrations"),
  join(pluginRoot, "dist", "http", "public"),
]) {
  assert(statSync(directory).isDirectory(), `${directory} is not a directory`);
}

console.log("Packed runtime smoke check passed.");
