import assert from "node:assert/strict";
import {
  assertLocalAdminProvisioningAllowed,
  assertLocalAdminDatabaseIdentity,
  LocalAdminProvisioningError,
  provisionExistingLocalAdmin,
  validateLocalAdminDatabaseConfig,
  validateLocalAdminDatabaseUrl,
} from "../lib/admin/localAdminProvisioning";

assertLocalAdminProvisioningAllowed(
  { NODE_ENV: "development" },
  ["--confirm-local-admin-provisioning"],
);
assert.throws(
  () => assertLocalAdminProvisioningAllowed({ NODE_ENV: "production" }, ["--confirm-local-admin-provisioning"]),
  /disabled when NODE_ENV is production/,
);
assert.throws(
  () => assertLocalAdminProvisioningAllowed({ NODE_ENV: "development" }, []),
  /Explicit confirmation is required/,
);

const local = (host = "127.0.0.1", database = "parthiv_db", port = "5433") =>
  `postgresql://test:test@${host.includes(":") ? `[${host}]` : host}:${port}/${database}`;

validateLocalAdminDatabaseUrl("DATABASE_URL", local());
validateLocalAdminDatabaseConfig({
  DATABASE_URL: local(),
  DIRECT_URL: local("::1"),
});

for (const url of [
  local("db.example.invalid"),
  local("192.168.1.10"),
  local("127.0.0.1", "production"),
  local("127.0.0.1", "parthiv_db", "5432"),
  "not-a-url",
]) {
  assert.throws(
    () => validateLocalAdminDatabaseUrl("DATABASE_URL", url),
    LocalAdminProvisioningError,
  );
}
assert.throws(
  () => validateLocalAdminDatabaseConfig({ DATABASE_URL: local() }),
  LocalAdminProvisioningError,
);

assertLocalAdminDatabaseIdentity({
  database: "parthiv_db",
  serverAddress: "127.0.0.1/32",
  serverPort: 5433,
});
for (const identity of [
  { database: "production", serverAddress: "127.0.0.1/32", serverPort: 5433 },
  { database: "parthiv_db", serverAddress: "192.168.1.10/32", serverPort: 5433 },
  { database: "parthiv_db", serverAddress: "127.0.0.1/32", serverPort: 5432 },
  { database: "parthiv_db", serverAddress: null, serverPort: 5433 },
]) {
  assert.throws(
    () => assertLocalAdminDatabaseIdentity(identity),
    LocalAdminProvisioningError,
  );
}

const state = {
  id: "existing-user",
  role: "AGENT",
  admin: { id: "existing-admin" },
  agent: { id: "existing-agent" },
  customer: { id: "existing-customer" },
};
const writes: unknown[] = [];
const prisma = {
  $transaction: async (work: (tx: any) => Promise<unknown>) => work({
    user: {
      findMany: async ({ where }: any) => {
        assert.ok(where.phone.in.includes("7842259582"));
        return [{ id: state.id, role: state.role, admin: state.admin }];
      },
      updateMany: async ({ where, data }: any) => {
        writes.push({ where, data });
        if (state.id !== where.id || state.role !== where.role) return { count: 0 };
        state.role = data.role;
        return { count: 1 };
      },
    },
  }),
};

async function run(): Promise<void> {
  const provisioned = await provisionExistingLocalAdmin(prisma);
  assert.deepEqual(provisioned, { userId: "existing-user", adminId: "existing-admin" });
  assert.equal(state.role, "ADMIN");
  assert.equal(state.admin.id, "existing-admin");
  assert.equal(state.agent.id, "existing-agent");
  assert.equal(state.customer.id, "existing-customer");
  assert.equal(writes.length, 1);
  assert.deepEqual(writes[0], {
    where: { id: "existing-user", role: "AGENT" },
    data: { role: "ADMIN" },
  });

  await assert.rejects(
    provisionExistingLocalAdmin(prisma),
    /one-time and made no changes/,
  );
  assert.equal(writes.length, 1, "repeat invocation must not write");

  console.log("Local admin provisioning safeguards and role promotion tests passed.");
}

void run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Local admin provisioning test failed.");
  process.exitCode = 1;
});
