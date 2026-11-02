import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const Module = require("node:module");
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === "server-only") return require.resolve("../package.json");
  return originalResolve.call(this, request, parent, isMain, options);
};

const originalEnv = {
  nodeEnv: process.env.NODE_ENV,
  otpTestMode: process.env.OTP_TEST_MODE,
  otpTestPhone: process.env.OTP_TEST_PHONE,
  jwtSecret: process.env.JWT_SECRET,
};
Reflect.set(process.env, "NODE_ENV", "development");
process.env.OTP_TEST_MODE = "true";
process.env.OTP_TEST_PHONE = "7842259582";
process.env.JWT_SECRET = "local-admin-login-test-secret-32-bytes-minimum";

async function run(): Promise<void> {
  const { NextRequest } = await import("next/server");
  const { POST: adminLogin } = await import("../app/api/auth/admin-login/route");
  const { getAuthUser, requireAdminUser } = await import("../lib/auth/middleware");
  const { db } = await import("../lib/db");
  const userDelegate = db.user as any;
  const originalFindFirst = userDelegate.findFirst;
  const originalFindUnique = userDelegate.findUnique;
  const existingAdminUser = {
    id: "existing-agent-user",
    phone: "+917842259582",
    name: "Existing Account",
    email: null,
    role: "ADMIN",
    admin: { id: "preserved-admin-record", userId: "existing-agent-user", accessLevel: "FULL" },
    agent: { id: "preserved-agent-record", userId: "existing-agent-user", status: "AVAILABLE" },
    customer: { id: "preserved-customer-record" },
  };
  userDelegate.findFirst = async () => ({ ...existingAdminUser });
  userDelegate.findUnique = async () => ({ ...existingAdminUser, tokenVersion: 1 });

  try {
    const request = new NextRequest("http://localhost:3000/api/auth/admin-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        origin: "http://localhost:3000",
        host: "localhost:3000",
      },
      body: JSON.stringify({ phone: "+917842259582", code: "123456" }),
    });

    const response = await adminLogin(request);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.data.user.role, "ADMIN");
    assert.equal(body.data.user.adminId, "preserved-admin-record");

    const token = response.cookies.get("jio_token")?.value;
    assert.ok(token);
    const authorizedUser = await getAuthUser(
      new NextRequest("http://localhost:3000/api/admin/orders", {
        headers: { Cookie: `jio_token=${token}` },
      }),
    );
    assert.equal(authorizedUser?.role, "ADMIN");
    assert.ok(requireAdminUser(authorizedUser));
    assert.equal(
      requireAdminUser({ ...authorizedUser!, role: "AGENT", adminId: null }),
      null,
      "agent sessions must not pass admin authorization",
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
    assert.equal(agentLoginResponse.status, 403);
    assert.equal(existingAdminUser.role, "ADMIN", "agent login must not demote admin accounts");

    console.log("Existing ADMIN account login and authorization recognition test passed.");
  } finally {
    userDelegate.findFirst = originalFindFirst;
    userDelegate.findUnique = originalFindUnique;
    await db.$disconnect();
    Module._resolveFilename = originalResolve;
    for (const [key, value] of Object.entries({
      NODE_ENV: originalEnv.nodeEnv,
      OTP_TEST_MODE: originalEnv.otpTestMode,
      OTP_TEST_PHONE: originalEnv.otpTestPhone,
      JWT_SECRET: originalEnv.jwtSecret,
    })) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else Reflect.set(process.env, key, value);
    }
  }
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin login test failed.");
  process.exitCode = 1;
});
