import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getAdminComplaints } from '../app/api/admin/complaints/route';
import { POST as createComplaint } from '../app/api/complaints/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

function request(
  role: 'CUSTOMER' | 'ADMIN',
  path: string,
  body?: Record<string, unknown>,
) {
  const token = signToken({
    userId: `local-test-${role.toLowerCase()}`,
    phone: 'local-test-only',
    role,
    ...(role === 'CUSTOMER' ? { customerId: 'local-test-customer' } : {}),
  });
  return new NextRequest(`http://localhost${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Cookie: `jio_token=${token}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function run() {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const oldJwtSecret = runtimeEnv.JWT_SECRET;
  runtimeEnv.JWT_SECRET = 'local-test-secret-that-is-not-a-real-credential';

  const client = db as any;
  const complaintDelegate = client.complaint;
  const originalFindMany = complaintDelegate.findMany;
  const originalCreate = complaintDelegate.create;
  const originalExecuteRawUnsafe = client.$executeRawUnsafe;
  let rawWriteCalls = 0;
  complaintDelegate.findMany = async () => [];
  complaintDelegate.create = async ({ data }: any) => ({ id: 'local-test-complaint', ...data });
  client.$executeRawUnsafe = async () => { rawWriteCalls += 1; };

  try {
    const adminResponse = await getAdminComplaints(
      request('ADMIN', '/api/admin/complaints'),
    );
    assert.equal(adminResponse.status, 200);

    const customerResponse = await createComplaint(
      request('CUSTOMER', '/api/complaints', { description: 'Local test message' }),
    );
    assert.equal(customerResponse.status, 200);
    assert.equal(rawWriteCalls, 0, 'complaint read and create routes never execute raw SQL writes');
  } finally {
    complaintDelegate.findMany = originalFindMany;
    complaintDelegate.create = originalCreate;
    client.$executeRawUnsafe = originalExecuteRawUnsafe;
    if (oldJwtSecret === undefined) delete runtimeEnv.JWT_SECRET;
    else runtimeEnv.JWT_SECRET = oldJwtSecret;
  }
}

void run().then(() => {
  console.log('Complaint route read-only schema regression tests passed.');
}).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Complaint route tests failed.');
  process.exitCode = 1;
});
