import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import {
  loadAndAssertLocalDatabaseConfig,
  LocalDatabaseSafetyError,
} from "../lib/localDatabaseSafety";

const [tool, ...toolArgs] = process.argv.slice(2);
const localTools: Record<string, string[]> = {
  next: ["next", "dist", "bin", "next"],
  prisma: ["prisma", "build", "index.js"],
  tsx: ["tsx", "dist", "cli.mjs"],
};

if (!tool || !localTools[tool]) {
  console.error("Local database guard received an unsupported local command.");
  process.exit(1);
}

try {
  (process.env as Record<string, string | undefined>)["NODE_ENV"] = "development";
  loadAndAssertLocalDatabaseConfig();
} catch (error) {
  console.error(
    error instanceof LocalDatabaseSafetyError
      ? error.message
      : "Unable to load local database configuration.",
  );
  process.exit(1);
}

const executable = resolve(process.cwd(), "node_modules", ...localTools[tool]);
const result = spawnSync(process.execPath, [executable, ...toolArgs], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error("Unable to start the requested local command.");
  process.exit(1);
}

process.exit(result.status ?? 1);
