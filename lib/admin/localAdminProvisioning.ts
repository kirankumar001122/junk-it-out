const APPROVED_DATABASE = "parthiv_db";
const APPROVED_PORT = "5433";
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const ADMIN_PHONE = "7842259582";

export class LocalAdminProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalAdminProvisioningError";
  }
}

export interface LocalAdminDatabaseEnvironment {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
}

export function assertLocalAdminProvisioningAllowed(
  env: { NODE_ENV?: string },
  args: readonly string[],
): void {
  if (!args.includes("--confirm-local-admin-provisioning")) {
    throw new LocalAdminProvisioningError(
      "Explicit confirmation is required: --confirm-local-admin-provisioning.",
    );
  }
  if (env.NODE_ENV === "production") {
    throw new LocalAdminProvisioningError(
      "Admin provisioning is disabled when NODE_ENV is production.",
    );
  }
}

export interface LocalAdminDatabaseIdentity {
  database: string;
  serverAddress: string | null;
  serverPort: number | bigint;
}

export function validateLocalAdminDatabaseUrl(name: string, value: string | undefined): void {
  if (!value?.trim()) {
    throw new LocalAdminProvisioningError(`${name} is required; admin provisioning is blocked.`);
  }

  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const database = decodeURIComponent(url.pathname.slice(1));
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !LOOPBACK_HOSTS.has(host) ||
      url.port !== APPROVED_PORT ||
      database !== APPROVED_DATABASE
    ) {
      throw new LocalAdminProvisioningError(
        `${name} must target the approved local parthiv_db on loopback port 5433; admin provisioning is blocked.`,
      );
    }
  } catch (error) {
    if (error instanceof LocalAdminProvisioningError) throw error;
    throw new LocalAdminProvisioningError(`${name} is malformed; admin provisioning is blocked.`);
  }
}

export function validateLocalAdminDatabaseConfig(env: LocalAdminDatabaseEnvironment): void {
  validateLocalAdminDatabaseUrl("DATABASE_URL", env.DATABASE_URL);
  validateLocalAdminDatabaseUrl("DIRECT_URL", env.DIRECT_URL);
}

export function assertLocalAdminDatabaseIdentity(identity: LocalAdminDatabaseIdentity): void {
  const [host, prefix] = identity.serverAddress?.toLowerCase().split("/") ?? [];
  const isLoopback =
    (host === "127.0.0.1" && (prefix === undefined || prefix === "32")) ||
    (host === "::1" && (prefix === undefined || prefix === "128"));

  if (
    identity.database !== APPROVED_DATABASE ||
    !isLoopback ||
    Number(identity.serverPort) !== Number(APPROVED_PORT)
  ) {
    throw new LocalAdminProvisioningError(
      "Connected PostgreSQL identity is not the approved local parthiv_db instance; no account changes were made.",
    );
  }
}

export async function provisionExistingLocalAdmin(prisma: any): Promise<{ userId: string; adminId: string }> {
  return prisma.$transaction(async (tx: any) => {
    const phoneVariants = [ADMIN_PHONE, `+91${ADMIN_PHONE}`, `91${ADMIN_PHONE}`, `0${ADMIN_PHONE}`];
    const matches = await tx.user.findMany({
      where: { phone: { in: phoneVariants } },
      select: {
        id: true,
        role: true,
        admin: { select: { id: true } },
      },
    });

    if (matches.length !== 1) {
      throw new LocalAdminProvisioningError(
        `Expected exactly one existing account for ${ADMIN_PHONE}; found ${matches.length}. No changes were made.`,
      );
    }

    const user = matches[0];
    if (user.role !== "AGENT") {
      throw new LocalAdminProvisioningError(
        `Expected the existing account to have AGENT role; found ${user.role}. Provisioning is one-time and made no changes.`,
      );
    }
    if (!user.admin?.id) {
      throw new LocalAdminProvisioningError(
        "The existing account has no Admin record; no duplicate records will be created.",
      );
    }

    const update = await tx.user.updateMany({
      where: { id: user.id, role: "AGENT" },
      data: { role: "ADMIN" },
    });
    if (update.count !== 1) {
      throw new LocalAdminProvisioningError(
        "The account changed during provisioning; transaction rolled back.",
      );
    }

    return { userId: user.id, adminId: user.admin.id };
  });
}
