import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === "server-only") return require.resolve("../package.json");
  return originalResolve.call(this, request, parent, isMain, options);
};

async function run(): Promise<void> {
  Reflect.set(process.env, "NODE_ENV", "development");
  const { loadAndAssertLocalDatabaseConfig } = await import("../lib/localDatabaseSafety");
  const {
    assertLocalAdminDatabaseIdentity,
    validateLocalAdminDatabaseConfig,
  } = await import("../lib/admin/localAdminProvisioning");

  loadAndAssertLocalDatabaseConfig();
  validateLocalAdminDatabaseConfig({
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  });

  const { db } = await import("../lib/db");
  try {
    const identity = await db.$queryRaw`
      SELECT current_database() AS database,
             inet_server_addr()::text AS "serverAddress",
             inet_server_port() AS "serverPort"
    `;
    assertLocalAdminDatabaseIdentity(identity[0]);

    const phoneVariants = ["7842259582", "+917842259582", "917842259582", "07842259582"];
    const accounts = await db.user.findMany({
      where: { phone: { in: phoneVariants } },
      select: {
        id: true,
        role: true,
        admin: { select: { id: true } },
        agent: { select: { id: true } },
        customer: { select: { id: true } },
      },
    });
    assert.equal(accounts.length, 1, "the local number must identify exactly one existing user");
    assert.equal(accounts[0].role, "ADMIN");
    assert.ok(accounts[0].admin?.id, "the existing Admin record must remain linked");
    assert.ok(accounts[0].agent?.id, "the existing Agent record must be preserved");
    assert.ok(accounts[0].customer?.id, "the existing Customer record must be preserved");

    process.env.OTP_TEST_MODE = "true";
    process.env.OTP_TEST_PHONE = "7842259582";
    assert.ok(
      Buffer.byteLength(process.env.JWT_SECRET?.trim() ?? "", "utf8") >= 32,
      "local JWT_SECRET must be configured with at least 32 bytes",
    );

    const { NextRequest } = await import("next/server");
    const { POST: adminLogin } = await import("../app/api/auth/admin-login/route");
    const loginResponse = await adminLogin(
      new NextRequest("http://localhost:3000/api/auth/admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({ phone: "+917842259582", code: "123456" }),
      }),
    );
    assert.equal(loginResponse.status, 200, "admin login must recognize the provisioned account");
    const loginBody = await loginResponse.json();
    assert.equal(loginBody.data.user.role, "ADMIN");
    assert.equal(loginBody.data.user.adminId, accounts[0].admin.id);

    const token = loginResponse.cookies.get("jio_token")?.value;
    assert.ok(token);
    const { GET: getAdminUsers } = await import("../app/api/admin/admin-users/route");
    const adminResponse = await getAdminUsers(
      new NextRequest("http://localhost:3000/api/admin/admin-users", {
        headers: { Cookie: `jio_token=${token}` },
      }),
    );
    assert.equal(adminResponse.status, 200, "the login token must authorize the admin API");
    const adminsBody = await adminResponse.json();
    assert.ok(
      adminsBody.data.some((admin: { id: string }) => admin.id === accounts[0].admin.id),
      "the existing Admin record must be visible to admin authorization",
    );

    const { POST: agentLogin } = await import("../app/api/auth/agent-login/route");
    const agentLoginResponse = await agentLogin(
      new NextRequest("http://localhost:3000/api/auth/agent-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          origin: "http://localhost:3000",
          host: "localhost:3000",
        },
        body: JSON.stringify({ phone: "+917842259582", code: "123456" }),
      }),
    );
    assert.equal(agentLoginResponse.status, 403, "an admin account must not enter the agent portal");
    const accountAfterAgentLogin = await db.user.findUnique({
      where: { id: accounts[0].id },
      select: { role: true },
    });
    assert.equal(accountAfterAgentLogin?.role, "ADMIN", "agent login must preserve the ADMIN role");

    console.log("Local DB admin login and admin API authorization integration test passed.");
  } finally {
    await db.$disconnect();
    Module._resolveFilename = originalResolve;
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local admin integration test failed.");
  process.exitCode = 1;
});
