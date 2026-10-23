import { loadEnvConfig } from "@next/env";

const REQUIRED_DATABASE_VARIABLES = ["DATABASE_URL", "DIRECT_URL"] as const;
const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export class LocalDatabaseSafetyError extends Error {}

export function validateLocalDatabaseUrl(
  variableName: (typeof REQUIRED_DATABASE_VARIABLES)[number],
  value: string | undefined,
): void {
  if (!value?.trim()) {
    throw new LocalDatabaseSafetyError(`${variableName} is required for local development.`);
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(value);
  } catch {
    throw new LocalDatabaseSafetyError(`${variableName} must be a valid local PostgreSQL URL.`);
  }

  if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
    throw new LocalDatabaseSafetyError(`${variableName} must use the PostgreSQL protocol.`);
  }

  const hostname = parsedUrl.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!LOCAL_DATABASE_HOSTS.has(hostname)) {
    throw new LocalDatabaseSafetyError(`${variableName} must use a loopback database host.`);
  }
}

export function assertLocalDatabaseConfig(
  env: Record<string, string | undefined> = process.env,
): void {
  for (const variableName of REQUIRED_DATABASE_VARIABLES) {
    validateLocalDatabaseUrl(variableName, env[variableName]);
  }
}

export function loadAndAssertLocalDatabaseConfig(): void {
  // Match Next.js development environment precedence before validating. An
  // existing process environment value keeps precedence and is validated too.
  loadEnvConfig(process.cwd(), true);
  assertLocalDatabaseConfig();
}
