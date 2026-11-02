import { loadAndAssertLocalDatabaseConfig } from "../lib/localDatabaseSafety";
import {
  assertLocalAdminProvisioningAllowed,
  assertLocalAdminDatabaseIdentity,
  LocalAdminProvisioningError,
  provisionExistingLocalAdmin,
  validateLocalAdminDatabaseConfig,
} from "../lib/admin/localAdminProvisioning";

async function main(): Promise<void> {
  let prisma: any;
  try {
    assertLocalAdminProvisioningAllowed(process.env, process.argv);
    loadAndAssertLocalDatabaseConfig();
    validateLocalAdminDatabaseConfig({
      DATABASE_URL: process.env.DATABASE_URL,
      DIRECT_URL: process.env.DIRECT_URL,
    });

    const { PrismaClient } = await import("@prisma/client");
    prisma = new PrismaClient();
    const identity = await prisma.$queryRaw`
      SELECT current_database() AS database,
             inet_server_addr()::text AS "serverAddress",
             inet_server_port() AS "serverPort"
    `;
    assertLocalAdminDatabaseIdentity(identity[0]);

    const result = await provisionExistingLocalAdmin(prisma);
    console.log(
      `Provisioned the existing local account as ADMIN. Existing Admin record ${result.adminId} was preserved.`,
    );
  } catch (error) {
    const message = error instanceof LocalAdminProvisioningError
      ? error.message
      : "Local admin provisioning failed; sensitive error details were withheld.";
    console.error(message);
    process.exitCode = 1;
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => undefined);
  }
}

if (typeof require !== "undefined" && require.main === module) {
  void main();
}
