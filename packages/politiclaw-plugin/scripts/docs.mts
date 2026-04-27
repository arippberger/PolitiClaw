import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import { POLITICLAW_CRON_TEMPLATES } from "../src/cron/templates.ts";
import {
  DOCS_BASELINE,
  SCHEMA_ONLY_PROVIDER_LABELS,
  SOURCE_COVERAGE_CATALOG,
} from "../src/docs/sourceCoverage.ts";
import {
  POLITICLAW_TOOL_GROUPS,
  REGISTERED_POLITICLAW_TOOL_DOCS,
} from "../src/docs/toolRegistry.ts";
import {
  TOOL_AUDIT_ENTRIES,
  type ToolAuditEntry,
  type ToolVisibilityTier,
} from "../src/docs/toolAudit.ts";
import { openMemoryDb } from "../src/storage/sqlite.ts";

type OutputFile = {
  path: string;
  content: string;
};

type SkillDoc = {
  directory: string;
  sourcePath: string;
  name: string;
  description: string;
  readWhen: readonly string[];
};

type ConfigKeyDoc = {
  key: string;
  description: string;
  status: string;
  required: boolean;
  wiredToday: boolean;
  sourcePaths: readonly string[];
  unlockedByTools: readonly string[];
  notes: string;
};

type StorageTableDoc = {
  name: string;
  sql: string;
  columns: Array<{
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
  }>;
  foreignKeys: Array<{
    from: string;
    toTable: string;
    toColumn: string;
  }>;
};

type StorageIndexDoc = {
  name: string;
  tableName: string;
  sql: string | null;
};

type PublishedDocPolicyIssue = {
  file: string;
  message: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const pluginRoot = join(repoRoot, "packages", "politiclaw-plugin");
const docsRoot = join(repoRoot, "apps", "docs");
const generatedRoot = join(docsRoot, "reference", "generated");
const mode = process.argv[2] ?? "generate";

if (mode !== "generate" && mode !== "check") {
  throw new Error(`Unknown mode '${mode}'. Expected 'generate' or 'check'.`);
}

const outputs = buildOutputs();
const driftedPaths = syncOutputs(outputs, mode === "check");
const policyIssues = [
  ...collectPublishedDocsPolicyIssues(),
  ...collectTierMislabelIssues(),
  ...collectManifestAndPackagingIssues(),
  ...collectAsciiDiagramIssues(),
];

if (driftedPaths.length > 0 || policyIssues.length > 0) {
  if (driftedPaths.length > 0) {
    console.error("Documentation drift detected:");
    for (const driftedPath of driftedPaths) {
      console.error(`- ${relative(repoRoot, driftedPath)}`);
    }
  }
  if (policyIssues.length > 0) {
    console.error("Published docs policy issues:");
    for (const issue of policyIssues) {
      console.error(`- ${issue.file}: ${issue.message}`);
    }
  }
  process.exit(1);
}

if (mode === "generate") {
  console.log(`Updated ${outputs.length} documentation artifact(s).`);
} else {
  console.log(`Documentation is current across ${outputs.length} generated artifact(s).`);
}

function buildOutputs(): OutputFile[] {
  const pluginManifest = JSON.parse(
    readFileSync(join(pluginRoot, "openclaw.plugin.json"), "utf8"),
  ) as {
    configSchema?: {
      properties?: {
        apiKeys?: {
          properties?: Record<string, { description?: string }>;
        };
      };
    };
  };

  const configKeyDocs = buildConfigKeyDocs(pluginManifest);
  const skillDocs = readSkillDocs();
  const storageDocs = readStorageDocs();
  const migrationFiles = readdirSync(join(pluginRoot, "src", "storage", "migrations"))
    .filter((fileName) => fileName.endsWith(".sql"))
    .sort();

  assertBaseline({
    toolCount: REGISTERED_POLITICLAW_TOOL_DOCS.length,
    cronCount: POLITICLAW_CRON_TEMPLATES.length,
    migrationCount: migrationFiles.length,
    skillCount: skillDocs.length,
  });

  const outputs: OutputFile[] = [];

  const toolsJson = REGISTERED_POLITICLAW_TOOL_DOCS.map((entry) => ({
    name: entry.tool.name,
    label: entry.tool.label ?? "",
    groupId: entry.groupId,
    groupLabel: entry.groupLabel,
    sourcePath: entry.sourcePath,
    description: entry.tool.description,
    parameters: describeToolParameters(entry.tool.parameters),
    rawSchema: entry.tool.parameters,
  }));
  const toolAuditDocs = buildToolAuditDocs();
  outputs.push({
    path: join(generatedRoot, "tools.json"),
    content: formatJson(toolsJson),
  });
  outputs.push({
    path: join(generatedRoot, "tools", "index.md"),
    content: renderGeneratedToolIndex(),
  });
  for (const entry of REGISTERED_POLITICLAW_TOOL_DOCS) {
    outputs.push({
      path: join(generatedRoot, "tools", `${entry.tool.name}.md`),
      content: renderToolPage(entry),
    });
  }
  outputs.push({
    path: join(generatedRoot, "tool-audit.json"),
    content: formatJson(toolAuditDocs),
  });
  outputs.push({
    path: join(generatedRoot, "tool-audit.md"),
    content: renderToolAuditPage(toolAuditDocs),
  });

  outputs.push({
    path: join(generatedRoot, "config-schema.json"),
    content: formatJson({
      keys: configKeyDocs,
      rawConfigSchema: pluginManifest.configSchema ?? {},
    }),
  });
  outputs.push({
    path: join(generatedRoot, "config-schema.md"),
    content: renderConfigSchemaPage(configKeyDocs),
  });

  outputs.push({
    path: join(generatedRoot, "source-coverage.json"),
    content: formatJson({
      providers: SOURCE_COVERAGE_CATALOG,
    }),
  });
  outputs.push({
    path: join(generatedRoot, "source-coverage.md"),
    content: renderSourceCoveragePage(),
  });

  outputs.push({
    path: join(generatedRoot, "cron-jobs.json"),
    content: formatJson(POLITICLAW_CRON_TEMPLATES),
  });
  outputs.push({
    path: join(generatedRoot, "cron-jobs.md"),
    content: renderCronJobsPage(),
  });

  outputs.push({
    path: join(generatedRoot, "skills.json"),
    content: formatJson(skillDocs),
  });
  outputs.push({
    path: join(generatedRoot, "skills.md"),
    content: renderSkillsPage(skillDocs),
  });

  outputs.push({
    path: join(generatedRoot, "storage-schema.md"),
    content: renderStorageSchemaPage(storageDocs, migrationFiles),
  });

  return outputs;
}

function buildConfigKeyDocs(pluginManifest: {
  configSchema?: {
    properties?: {
      apiKeys?: {
        properties?: Record<string, { description?: string }>;
      };
    };
  };
}): ConfigKeyDoc[] {
  const properties = pluginManifest.configSchema?.properties?.apiKeys?.properties ?? {};
  return Object.entries(properties).map(([key, value]) => {
    const coverage = SOURCE_COVERAGE_CATALOG.find((entry) => entry.configKey === key);
    return {
      key,
      description: value.description ?? "",
      status: coverage?.status ?? "unknown",
      required: coverage?.required ?? false,
      wiredToday: coverage?.status === "implemented" || coverage?.status === "optional_upgrade",
      sourcePaths: coverage?.sourcePaths ?? [],
      unlockedByTools: coverage?.unlockedByTools ?? [],
      notes: coverage?.notes ?? "No source coverage entry recorded for this key.",
    };
  });
}

function readSkillDocs(): SkillDoc[] {
  const skillsDir = join(pluginRoot, "skills");
  const directories = readdirSync(skillsDir)
    .filter((entry) => !entry.startsWith("."))
    .sort();

  return directories.map((directory) => {
    const sourcePath = join(skillsDir, directory, "SKILL.md");
    const raw = readFileSync(sourcePath, "utf8");
    const frontMatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
    if (!frontMatterMatch?.[1]) {
      throw new Error(`Expected front matter in ${relative(repoRoot, sourcePath)}.`);
    }
    const frontMatter = yaml.load(frontMatterMatch[1]) as {
      name?: string;
      description?: string;
      read_when?: string[];
    };
    return {
      directory,
      sourcePath: relative(repoRoot, sourcePath),
      name: frontMatter.name ?? directory,
      description: frontMatter.description ?? "",
      readWhen: frontMatter.read_when ?? [],
    };
  });
}

function readStorageDocs(): { tables: StorageTableDoc[]; indexes: StorageIndexDoc[] } {
  const db = openMemoryDb();
  try {
    const tables = db
      .prepare(
        `SELECT name, sql
           FROM sqlite_schema
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY name`,
      )
      .all() as Array<{ name: string; sql: string }>;

    const tableDocs: StorageTableDoc[] = tables.map((table) => {
      const foreignKeyRows = db.pragma(
        `foreign_key_list(${quoteSqliteIdentifier(table.name)})`,
      ) as Array<{
        id: number;
        seq: number;
        table: string;
        from: string;
        to: string;
        on_update: string;
        on_delete: string;
        match: string;
      }>;
      return {
        name: table.name,
        sql: table.sql,
        columns: db.pragma(`table_info(${quoteSqliteIdentifier(table.name)})`) as StorageTableDoc["columns"],
        foreignKeys: foreignKeyRows.map((row) => ({
          from: row.from,
          toTable: row.table,
          toColumn: row.to,
        })),
      };
    });

    const indexes = db
      .prepare(
        `SELECT name, tbl_name AS tableName, sql
           FROM sqlite_schema
          WHERE type = 'index'
            AND name NOT LIKE 'sqlite_%'
          ORDER BY tbl_name, name`,
      )
      .all() as StorageIndexDoc[];

    return { tables: tableDocs, indexes };
  } finally {
    db.close();
  }
}

function buildToolAuditDocs(): Array<
  ToolAuditEntry & {
    label: string;
    groupId: string;
    groupLabel: string;
    sourcePath: string;
  }
> {
  const auditByName = new Map(TOOL_AUDIT_ENTRIES.map((entry) => [entry.name, entry]));
  const docs = REGISTERED_POLITICLAW_TOOL_DOCS.map((entry) => {
    const audit = auditByName.get(entry.tool.name);
    if (!audit) {
      throw new Error(`Missing tool audit entry for ${entry.tool.name}.`);
    }
    return {
      ...audit,
      label: entry.tool.label ?? entry.tool.name,
      groupId: entry.groupId,
      groupLabel: entry.groupLabel,
      sourcePath: entry.sourcePath,
    };
  });

  const unknown = TOOL_AUDIT_ENTRIES.filter(
    (entry) => !REGISTERED_POLITICLAW_TOOL_DOCS.some((toolDoc) => toolDoc.tool.name === entry.name),
  );
  if (unknown.length > 0) {
    throw new Error(
      `Tool audit catalog includes unregistered tool(s): ${unknown.map((entry) => entry.name).join(", ")}.`,
    );
  }

  return docs;
}

function renderGeneratedToolIndex(): string {
  const lines: string[] = [
    "# Generated Tool Reference",
    "",
    `This section is generated from the registered runtime tool objects. Current count: ${REGISTERED_POLITICLAW_TOOL_DOCS.length}.`,
    "",
  ];

  for (const group of POLITICLAW_TOOL_GROUPS) {
    lines.push(`## ${group.label}`);
    lines.push("");
    lines.push(group.description);
    lines.push("");
    for (const entry of group.entries) {
      lines.push(
        `- [\`${entry.tool.name}\`](./${entry.tool.name}.md) — ${entry.tool.label ?? entry.tool.name}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderToolAuditPage(
  entries: readonly (ToolAuditEntry & {
    label: string;
    groupId: string;
    groupLabel: string;
    sourcePath: string;
  })[],
): string {
  const lines: string[] = [
    "# Generated Tool Audit",
    "",
    "This page is generated from the runtime tool registry plus the maintainer-facing visibility audit catalog.",
    "",
    "Review question: would a normal user knowingly reach for this tool by name, or is it better treated as a follow-up or implementation detail?",
    "",
    "| Tool | Group | Tier | Docs action | Why |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const entry of entries) {
    lines.push(
      `| [\`${entry.name}\`](./tools/${entry.name}.md) | ${escapeTableCell(entry.groupLabel)} | \`${entry.tier}\` | \`${entry.docsAction}\` | ${escapeTableCell(entry.rationale)} |`,
    );
  }

  lines.push(
    "",
    "## Tier meanings",
    "",
    "- `core`: belongs in primary task-based guides and should be treated as a default entry point.",
    "- `advanced`: useful, but better as a follow-up or power-user move.",
    "- `internal`: keep available and documented, but avoid leading users to it in primary docs.",
    "",
    "## Docs action meanings",
    "",
    "- `lead-in-guides`: surface in onboarding, task pages, and user-facing navigation.",
    "- `follow-up-or-advanced-docs`: keep visible for deeper workflows, but not as the default front door.",
    "- `generated-reference-only`: keep in generated reference and maintainer docs unless there is a specific reason to surface it.",
  );

  return lines.join("\n");
}

function renderToolPage(entry: (typeof REGISTERED_POLITICLAW_TOOL_DOCS)[number]): string {
  const parameters = describeToolParameters(entry.tool.parameters);
  const lines: string[] = [
    `# ${entry.tool.name}`,
    "",
    `- Label: ${entry.tool.label ?? entry.tool.name}`,
    `- Group: ${entry.groupLabel}`,
    `- Source file: \`${entry.sourcePath}\``,
    "",
    "## Description",
    "",
    entry.tool.description,
    "",
    "## Parameters",
    "",
  ];

  if (parameters.length === 0) {
    lines.push("This tool takes no parameters.");
  } else {
    lines.push("| Name | Required | Type | Description |");
    lines.push("| --- | --- | --- | --- |");
    for (const parameter of parameters) {
      lines.push(
        `| \`${parameter.name}\` | ${parameter.required ? "yes" : "no"} | \`${escapeTableCell(parameter.type)}\` | ${escapeTableCell(parameter.description)} |`,
      );
    }
  }

  lines.push("", "## Raw Schema", "", "```json", formatJson(entry.tool.parameters).trim(), "```", "");

  return lines.join("\n");
}

function renderConfigSchemaPage(configKeyDocs: readonly ConfigKeyDoc[]): string {
  const lines: string[] = [
    "# Generated Config Schema",
    "",
    "This page is generated from `openclaw.plugin.json` plus the explicit runtime source coverage catalog.",
    "",
    "| Key | Required | Status | Wired Today | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const keyDoc of configKeyDocs) {
    lines.push(
      `| \`apiKeys.${keyDoc.key}\` | ${keyDoc.required ? "yes" : "no"} | \`${keyDoc.status}\` | ${keyDoc.wiredToday ? "yes" : "no"} | ${escapeTableCell(keyDoc.description)} |`,
    );
  }

  lines.push("");
  for (const keyDoc of configKeyDocs) {
    lines.push(`## apiKeys.${keyDoc.key}`);
    lines.push("");
    lines.push(keyDoc.description);
    lines.push("");
    lines.push(`- Runtime status: \`${keyDoc.status}\``);
    lines.push(`- Required: ${keyDoc.required ? "yes" : "no"}`);
    lines.push(`- Wired today: ${keyDoc.wiredToday ? "yes" : "no"}`);
    if (keyDoc.unlockedByTools.length > 0) {
      lines.push(`- Unlocks: ${keyDoc.unlockedByTools.map((toolName) => `\`${toolName}\``).join(", ")}`);
    }
    if (keyDoc.sourcePaths.length > 0) {
      lines.push(`- Runtime files: ${keyDoc.sourcePaths.map((path) => `\`${path}\``).join(", ")}`);
    }
    lines.push(`- Notes: ${keyDoc.notes}`);
    lines.push("");
  }

  return lines.join("\n");
}

function renderSourceCoveragePage(): string {
  const lines: string[] = [
    "# Generated Source Coverage",
    "",
    "This page is generated from the explicit source coverage catalog.",
    "",
    "## Status Legend",
    "",
    "- `implemented`: wired into the current runtime with no extra integration work required.",
    "- `optional_upgrade`: wired today, but only active when the user provides a key.",
    "- `schema_only`: declared in the config schema, but not wired into runtime logic yet.",
    "- `transport_pending`: the adapter shape exists, but the production transport is not wired.",
    "",
    "| Provider | Status | Config Key | Required | Summary |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const entry of SOURCE_COVERAGE_CATALOG) {
    lines.push(
      `| ${escapeTableCell(entry.label)} | \`${entry.status}\` | ${entry.configKey ? `\`apiKeys.${entry.configKey}\`` : "n/a"} | ${entry.required ? "yes" : "no"} | ${escapeTableCell(entry.summary)} |`,
    );
  }

  lines.push("", "## Provider Details", "");

  for (const entry of SOURCE_COVERAGE_CATALOG) {
    lines.push(`### ${entry.label}`);
    lines.push("");
    lines.push(`- Status: \`${entry.status}\``);
    lines.push(`- Required: ${entry.required ? "yes" : "no"}`);
    if (entry.configKey) {
      lines.push(`- Config key: \`apiKeys.${entry.configKey}\``);
    }
    lines.push(`- Summary: ${entry.summary}`);
    lines.push(`- Notes: ${entry.notes}`);
    if (entry.unlockedByTools.length > 0) {
      lines.push(
        `- Tools: ${entry.unlockedByTools.map((toolName) => `\`${toolName}\``).join(", ")}`,
      );
    }
    lines.push(
      `- Runtime files: ${entry.sourcePaths.map((sourcePath) => `\`${sourcePath}\``).join(", ")}`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

function renderCronJobsPage(): string {
  const lines: string[] = [
    "# Generated Cron Jobs",
    "",
    "This page is generated from `packages/politiclaw-plugin/src/cron/templates.ts`.",
    "",
    `Current template count: ${POLITICLAW_CRON_TEMPLATES.length}.`,
    "",
    "| Name | Schedule | Session Target | Wake Mode | Delivery |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const template of POLITICLAW_CRON_TEMPLATES) {
    lines.push(
      `| \`${template.name}\` | ${escapeTableCell(describeSchedule(template.schedule))} | \`${template.sessionTarget}\` | \`${template.wakeMode}\` | \`${template.delivery.mode}:${template.delivery.channel}\` |`,
    );
  }

  lines.push("");
  for (const template of POLITICLAW_CRON_TEMPLATES) {
    lines.push(`## ${template.name}`);
    lines.push("");
    lines.push(`- Description: ${template.description}`);
    lines.push(`- Schedule: ${describeSchedule(template.schedule)}`);
    lines.push(`- Session target: \`${template.sessionTarget}\``);
    lines.push(`- Wake mode: \`${template.wakeMode}\``);
    lines.push(`- Delivery: \`${template.delivery.mode}:${template.delivery.channel}\``);
    lines.push("", "### Payload", "", "```text", template.payload.message, "```", "");
  }

  return lines.join("\n");
}

function renderSkillsPage(skillDocs: readonly SkillDoc[]): string {
  const lines: string[] = [
    "# Generated Skills Reference",
    "",
    "This page is generated from the skill front matter files in `packages/politiclaw-plugin/skills`.",
    "",
    `Current skill count: ${skillDocs.length}.`,
    "",
    "| Skill | Directory | Summary |",
    "| --- | --- | --- |",
  ];

  for (const skillDoc of skillDocs) {
    lines.push(
      `| \`${skillDoc.name}\` | \`${skillDoc.directory}\` | ${escapeTableCell(skillDoc.description)} |`,
    );
  }

  lines.push("");
  for (const skillDoc of skillDocs) {
    lines.push(`## ${skillDoc.name}`);
    lines.push("");
    lines.push(`- Source file: \`${skillDoc.sourcePath}\``);
    lines.push(`- Description: ${skillDoc.description}`);
    if (skillDoc.readWhen.length > 0) {
      lines.push("- Read when:");
      for (const item of skillDoc.readWhen) {
        lines.push(`  - ${item}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderStorageSchemaPage(
  storageDocs: { tables: StorageTableDoc[]; indexes: StorageIndexDoc[] },
  migrationFiles: readonly string[],
): string {
  const lines: string[] = [
    "# Generated Storage Schema",
    "",
    "This page is generated from a real in-memory SQLite database after migrations run.",
    "",
    `Migration count: ${migrationFiles.length}.`,
    "",
    "## Schema overview",
    "",
    "```mermaid",
    "erDiagram",
  ];

  for (const table of storageDocs.tables) {
    const fkFromColumns = new Set(table.foreignKeys.map((fk) => fk.from));
    lines.push(`  ${table.name} {`);
    for (const column of table.columns) {
      const columnType = (column.type || "TEXT").replace(/\s+/g, "_");
      const markers: string[] = [];
      if (column.pk > 0) markers.push("PK");
      if (fkFromColumns.has(column.name)) markers.push("FK");
      const markerSuffix = markers.length > 0 ? ` ${markers.join(",")}` : "";
      lines.push(`    ${columnType} ${column.name}${markerSuffix}`);
    }
    lines.push("  }");
  }
  for (const table of storageDocs.tables) {
    for (const fk of table.foreignKeys) {
      lines.push(
        `  ${fk.toTable} ||--o{ ${table.name} : "${fk.from} -> ${fk.toTable}.${fk.toColumn}"`,
      );
    }
  }
  lines.push("```", "");

  lines.push("## Migrations", "");

  for (const migrationFile of migrationFiles) {
    lines.push(`- \`packages/politiclaw-plugin/src/storage/migrations/${migrationFile}\``);
  }

  lines.push("", "## Tables", "");
  for (const table of storageDocs.tables) {
    lines.push(`### ${table.name}`);
    lines.push("");
    lines.push("| Column | Type | Not Null | Primary Key | Default |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const column of table.columns) {
      lines.push(
        `| \`${column.name}\` | \`${column.type || "TEXT"}\` | ${column.notnull === 1 ? "yes" : "no"} | ${column.pk > 0 ? "yes" : "no"} | ${column.dflt_value ? `\`${escapeTableCell(column.dflt_value)}\`` : "n/a"} |`,
      );
    }
    lines.push("", "```sql", table.sql.trim(), "```", "");
  }

  lines.push("## Indexes", "");
  if (storageDocs.indexes.length === 0) {
    lines.push("No indexes found.");
  } else {
    lines.push("| Index | Table | Definition |");
    lines.push("| --- | --- | --- |");
    for (const index of storageDocs.indexes) {
      lines.push(
        `| \`${index.name}\` | \`${index.tableName}\` | ${index.sql ? `\`${escapeTableCell(index.sql)}\`` : "auto"} |`,
      );
    }
  }
  lines.push("");

  return lines.join("\n");
}

function syncOutputs(outputs: readonly OutputFile[], checkOnly: boolean): string[] {
  const driftedPaths: string[] = [];
  const expectedPaths = new Set(outputs.map((output) => output.path));
  for (const output of outputs) {
    const existing = safeRead(output.path);
    if (existing !== output.content) {
      if (checkOnly) {
        driftedPaths.push(output.path);
        continue;
      }
      mkdirSync(dirname(output.path), { recursive: true });
      writeFileSync(output.path, output.content);
    }
  }

  for (const existingPath of collectExistingFiles(generatedRoot)) {
    if (expectedPaths.has(existingPath)) continue;
    if (checkOnly) {
      driftedPaths.push(existingPath);
      continue;
    }
    unlinkSync(existingPath);
  }

  return driftedPaths;
}

function collectExistingFiles(root: string): string[] {
  if (!safeReadDir(root)) return [];
  const files: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      files.push(nextPath);
    }
  }
  return files;
}

function safeReadDir(path: string): boolean {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

function collectPublishedDocsPolicyIssues(): PublishedDocPolicyIssue[] {
  const markdownFiles = collectMarkdownFiles(docsRoot);
  const issues: PublishedDocPolicyIssue[] = [];
  // Include the trailing separator so that sibling directories whose names
  // share a prefix (e.g. `reference/generated-backup`) are not treated as if
  // they live under `reference/generated`.
  const generatedDocsPrefix = generatedRoot + sep;

  for (const markdownFile of markdownFiles) {
    const relativePath = relative(repoRoot, markdownFile);
    const content = readFileSync(markdownFile, "utf8");

    if (mentionsHiddenDocs(content)) {
      issues.push({
        file: relativePath,
        message: "references the hidden docs path",
      });
    }

    if (!markdownFile.startsWith(generatedDocsPrefix)) {
      for (const label of SCHEMA_ONLY_PROVIDER_LABELS) {
        const pattern = new RegExp(`\\b${escapeRegExp(label)}\\b`, "i");
        if (pattern.test(content)) {
          issues.push({
            file: relativePath,
            message: `mentions schema-only integration '${label}' outside the generated source coverage pages`,
          });
        }
      }
    }
  }

  return issues;
}

function collectMarkdownFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      if (entry.name === ".vitepress") continue;
      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith(".md")) {
        results.push(nextPath);
      }
    }
  }
  return results.sort();
}

function mentionsHiddenDocs(content: string): boolean {
  return /`\/docs`|\]\(\/docs(?:\/|\))|\]\(docs(?:\/|\))|[^\w]\/docs(?:\/|\b)/.test(content);
}

function collectTierMislabelIssues(): PublishedDocPolicyIssue[] {
  // Catches the kind of drift that landed three tools under "Tier 3 internal"
  // in tool-surface.md when their toolAudit.ts entries said `core` or
  // `advanced`. Any hand-written page that lists a `politiclaw_*` tool
  // underneath a "## Tier N ..." heading must agree with TOOL_AUDIT_ENTRIES.
  const markdownFiles = collectMarkdownFiles(docsRoot);
  const issues: PublishedDocPolicyIssue[] = [];
  const generatedDocsPrefix = generatedRoot + sep;
  const auditByName = new Map(TOOL_AUDIT_ENTRIES.map((entry) => [entry.name, entry]));
  const tierByNumber: Record<string, ToolVisibilityTier> = {
    "1": "core",
    "2": "advanced",
    "3": "internal",
  };
  const tierHeadingPattern = /^##\s+Tier\s+(\d)\b/i;
  const seen = new Set<string>();

  for (const markdownFile of markdownFiles) {
    if (markdownFile.startsWith(generatedDocsPrefix)) continue;
    const relativePath = relative(repoRoot, markdownFile);
    const content = readFileSync(markdownFile, "utf8");
    const lines = content.split("\n");

    let currentTier: ToolVisibilityTier | null = null;
    let currentTierNumber: string | null = null;

    for (const line of lines) {
      if (line.startsWith("## ")) {
        const headingMatch = line.match(tierHeadingPattern);
        if (headingMatch) {
          currentTierNumber = headingMatch[1];
          currentTier = tierByNumber[currentTierNumber] ?? null;
        } else {
          currentTier = null;
          currentTierNumber = null;
        }
        continue;
      }
      if (!currentTier || !currentTierNumber) continue;

      for (const match of line.matchAll(/`(politiclaw_\w+)`/g)) {
        const toolName = match[1];
        const audit = auditByName.get(toolName);
        if (!audit) continue;
        if (audit.tier === currentTier) continue;
        const dedupeKey = `${relativePath}::${toolName}::${currentTierNumber}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        issues.push({
          file: relativePath,
          message: `lists \`${toolName}\` under "Tier ${currentTierNumber}" but the audit catalog classifies it as \`${audit.tier}\``,
        });
      }
    }
  }

  return issues;
}

function assertBaseline(counts: {
  toolCount: number;
  cronCount: number;
  migrationCount: number;
  skillCount: number;
}): void {
  const mismatches: string[] = [];
  if (counts.toolCount !== DOCS_BASELINE.tools) {
    mismatches.push(`tools: expected ${DOCS_BASELINE.tools}, found ${counts.toolCount}`);
  }
  if (counts.cronCount !== DOCS_BASELINE.cronTemplates) {
    mismatches.push(
      `cron templates: expected ${DOCS_BASELINE.cronTemplates}, found ${counts.cronCount}`,
    );
  }
  if (counts.migrationCount !== DOCS_BASELINE.migrations) {
    mismatches.push(
      `migrations: expected ${DOCS_BASELINE.migrations}, found ${counts.migrationCount}`,
    );
  }
  if (counts.skillCount !== DOCS_BASELINE.skills) {
    mismatches.push(`skills: expected ${DOCS_BASELINE.skills}, found ${counts.skillCount}`);
  }
  if (mismatches.length > 0) {
    throw new Error(
      "Documentation baseline changed. Update DOCS_BASELINE and regenerate docs:\n" +
        mismatches.map((line) => `- ${line}`).join("\n"),
    );
  }
}

function describeToolParameters(schema: unknown): Array<{
  name: string;
  required: boolean;
  type: string;
  description: string;
}> {
  if (!isRecord(schema)) return [];
  if (schema.type !== "object") return [];
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? new Set(schema.required) : new Set<string>();

  return Object.entries(properties).map(([name, value]) => {
    const property = isRecord(value) ? value : {};
    return {
      name,
      required: required.has(name),
      type: schemaType(property),
      description: typeof property.description === "string" ? property.description : "",
    };
  });
}

function schemaType(schema: Record<string, unknown>): string {
  if (Array.isArray(schema.anyOf)) {
    return schema.anyOf
      .map((member) => {
        if (isRecord(member) && "const" in member) {
          return JSON.stringify(member.const);
        }
        if (isRecord(member)) return schemaType(member);
        return "unknown";
      })
      .join(" | ");
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((value) => JSON.stringify(value)).join(" | ");
  }
  if (typeof schema.type === "string") {
    if (schema.type === "array" && isRecord(schema.items)) {
      return `${schemaType(schema.items)}[]`;
    }
    return schema.type;
  }
  if ("const" in schema) {
    return JSON.stringify(schema.const);
  }
  return "unknown";
}

function describeSchedule(schedule: { kind: string; everyMs?: number; expr?: string; tz?: string }): string {
  if (schedule.kind === "every") {
    const everyMs = schedule.everyMs ?? 0;
    const minutes = everyMs / (60 * 1000);
    if (minutes % (24 * 60) === 0) {
      return `every ${minutes / (24 * 60)} day(s)`;
    }
    if (minutes % 60 === 0) {
      return `every ${minutes / 60} hour(s)`;
    }
    return `every ${minutes} minute(s)`;
  }
  return schedule.tz ? `${schedule.expr} (${schedule.tz})` : schedule.expr ?? "unknown";
}

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function quoteSqliteIdentifier(identifier: string): string {
  return `'${identifier.replace(/'/g, "''")}'`;
}

function safeRead(filePath: string): string | null {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

function escapeTableCell(value: string): string {
  return value
    .replace(/\|/g, "\\|")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, " ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function collectManifestAndPackagingIssues(): PublishedDocPolicyIssue[] {
  // Catches the four kinds of drift surfaced over the last few PRs:
  //   (1) openclaw.plugin.json:version falling behind package.json:version,
  //   (2) hidden-doc shorthand (tier-N, ADR-N, §N, Phase Na) sneaking back
  //       into the user-visible manifest, banned by AGENTS.md,
  //   (3) the openclaw.compat / openclaw.build / openclaw.runtimeExtensions
  //       fields required by docs.openclaw.ai/plugins/building-plugins
  //       getting dropped during a refactor,
  //   (4) source files reverting to the deprecated monolithic
  //       `from "openclaw/plugin-sdk"` root import.
  const issues: PublishedDocPolicyIssue[] = [];
  const manifestPath = join(pluginRoot, "openclaw.plugin.json");
  const packageJsonPath = join(pluginRoot, "package.json");
  const manifestRel = relative(repoRoot, manifestPath);
  const packageJsonRel = relative(repoRoot, packageJsonPath);

  const manifestRaw = safeRead(manifestPath);
  const packageJsonRaw = safeRead(packageJsonPath);
  if (manifestRaw === null) {
    issues.push({ file: manifestRel, message: "could not read plugin manifest" });
  }
  if (packageJsonRaw === null) {
    issues.push({ file: packageJsonRel, message: "could not read package.json" });
  }
  if (manifestRaw === null || packageJsonRaw === null) return issues;

  let manifest: unknown;
  let packageJson: unknown;
  try {
    manifest = JSON.parse(manifestRaw);
  } catch (error) {
    issues.push({ file: manifestRel, message: `parse error: ${String(error)}` });
    return issues;
  }
  try {
    packageJson = JSON.parse(packageJsonRaw);
  } catch (error) {
    issues.push({ file: packageJsonRel, message: `parse error: ${String(error)}` });
    return issues;
  }
  if (!isRecord(manifest) || !isRecord(packageJson)) return issues;

  const manifestVersion = manifest.version;
  const packageVersion = packageJson.version;
  if (
    typeof manifestVersion === "string" &&
    typeof packageVersion === "string" &&
    manifestVersion !== packageVersion
  ) {
    issues.push({
      file: manifestRel,
      message:
        `version '${manifestVersion}' does not match package.json version ` +
        `'${packageVersion}'; bump both together`,
    });
  }

  const shorthandPatterns: ReadonlyArray<{ pattern: RegExp; label: string }> = [
    { pattern: /\bADR-\d+\b/i, label: "ADR-N reference" },
    { pattern: /\bPhase\s+\d+[a-z]?\b/i, label: "Phase N reference" },
    { pattern: /§\s*\d+/, label: "section-number reference" },
    { pattern: /\btier-\d+\b/i, label: "tier-N shorthand" },
  ];
  for (const { pattern, label } of shorthandPatterns) {
    const match = manifestRaw.match(pattern);
    if (match) {
      issues.push({
        file: manifestRel,
        message:
          `contains hidden-doc shorthand '${match[0]}' (${label}); the manifest ` +
          `is user-visible and must be self-contained per AGENTS.md`,
      });
    }
  }

  const openclawBlock = isRecord(packageJson.openclaw) ? packageJson.openclaw : {};
  const requiredOpenclawPaths: ReadonlyArray<readonly string[]> = [
    ["compat", "pluginApi"],
    ["compat", "minGatewayVersion"],
    ["build", "openclawVersion"],
    ["build", "pluginSdkVersion"],
    ["runtimeExtensions"],
  ];
  for (const path of requiredOpenclawPaths) {
    let cursor: unknown = openclawBlock;
    for (const segment of path) {
      if (!isRecord(cursor)) {
        cursor = undefined;
        break;
      }
      cursor = cursor[segment];
    }
    if (cursor === undefined || cursor === null || cursor === "") {
      issues.push({
        file: packageJsonRel,
        message:
          `missing required openclaw.${path.join(".")} per ` +
          `docs.openclaw.ai/plugins/building-plugins`,
      });
    }
  }

  const monolithicImportPattern = /from\s+["']openclaw\/plugin-sdk["']/;
  for (const sourceFile of collectTypeScriptFiles(join(pluginRoot, "src"))) {
    const content = safeRead(sourceFile);
    if (content === null) continue;
    if (monolithicImportPattern.test(content)) {
      issues.push({
        file: relative(repoRoot, sourceFile),
        message:
          "imports from the deprecated monolithic 'openclaw/plugin-sdk' root; " +
          "use a focused 'openclaw/plugin-sdk/<subpath>' instead",
      });
    }
  }

  return issues;
}

function collectAsciiDiagramIssues(): PublishedDocPolicyIssue[] {
  // Catches box-drawing-char ASCII diagrams that should be Mermaid blocks.
  // Mermaid was wired into VitePress in the same change that added this
  // assertion; from then on, every shipped diagram in apps/docs/ should
  // live in a fenced ```mermaid block.
  const issues: PublishedDocPolicyIssue[] = [];
  const generatedDocsPrefix = generatedRoot + sep;
  // Only the unambiguous diagram-defining glyphs. Arrow chars like → are
  // intentionally excluded because they appear constantly in prose
  // breadcrumbs ("API Keys → googleCivic") and CTA buttons. A line is only
  // a diagram when it has actual box corners or connectors.
  const boxDrawingPattern = /[─│┌┐└┘├┤┬┴┼]/;

  for (const markdownFile of collectMarkdownFiles(docsRoot)) {
    if (markdownFile.startsWith(generatedDocsPrefix)) continue;
    const relativePath = relative(repoRoot, markdownFile);
    const content = readFileSync(markdownFile, "utf8");
    const lines = content.split("\n");

    let inFence = false;
    let firstHitLine: number | null = null;
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? "";
      if (line.trimStart().startsWith("```")) {
        inFence = !inFence;
        continue;
      }
      if (inFence) continue;
      if (boxDrawingPattern.test(line)) {
        firstHitLine = lineIndex + 1;
        break;
      }
    }
    if (firstHitLine !== null) {
      issues.push({
        file: relativePath,
        message:
          `line ${firstHitLine} contains ASCII box-and-arrow diagram chars; ` +
          "use a fenced `mermaid` block instead",
      });
    }
  }

  return issues;
}

function collectTypeScriptFiles(root: string): string[] {
  const results: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
        continue;
      }
      if (entry.isFile() && nextPath.endsWith(".ts")) {
        results.push(nextPath);
      }
    }
  }
  return results.sort();
}
