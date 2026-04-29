import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function copyDirectory(source: string, destination: string): void {
  rmSync(destination, { force: true, recursive: true });
  mkdirSync(destination, { recursive: true });
  cpSync(source, destination, { recursive: true });
}

copyDirectory(
  join(pluginRoot, "src", "storage", "migrations"),
  join(pluginRoot, "dist", "storage", "migrations"),
);

copyDirectory(
  join(pluginRoot, "src", "http", "public"),
  join(pluginRoot, "dist", "http", "public"),
);
