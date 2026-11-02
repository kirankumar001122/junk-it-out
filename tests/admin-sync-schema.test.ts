import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET } from '../app/api/admin/sync-schema/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

function request(role?: 'CUSTOMER' | 'ADMIN') {
  const headers = new Headers();
  if (role) {
    const token = signToken({ userId: `test-${role.toLowerCase()}`, phone: 'test-only', role });
    headers.set('Cookie', `jio_token=${token}`);
  }
  return new NextRequest('http://localhost/api/admin/sync-schema', { headers });
}

async function run() {
  const runtimeEnv = process.env as Record<string, string | undefined>;
  const oldJwtSecret = runtimeEnv.JWT_SECRET;
  runtimeEnv.JWT_SECRET = 'local-test-secret-that-is-not-a-real-credential';

  const client = db as any;
  const delegates = [client.complaint, client.order, client.customer, client.user];
  const original = {
    queryRaw: client.$queryRaw,
    executeRawUnsafe: client.$executeRawUnsafe,
    counts: delegates.map((delegate) => delegate.count),
  };
  let executeCalls = 0;
  client.$queryRaw = async () => [{
    table_name: 'Complaint',
    column_name: 'orderId',
    is_nullable: 'YES',
    data_type: 'text',
  }];
  client.$executeRawUnsafe = async () => { executeCalls += 1; };
  delegates.forEach((delegate) => { delegate.count = async () => 0; });

  try {
    assert.equal((await GET(request())).status, 401);
    assert.equal((await GET(request('CUSTOMER'))).status, 403);

    const response = await GET(request('ADMIN'));
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.details.isNullable, true);
    assert.equal(result.message, 'Complaint schema diagnostic complete. No schema changes were made.');
    assert.equal(executeCalls, 0, 'diagnostic GET never executes SQL writes');
  } finally {
    client.$queryRaw = original.queryRaw;
    client.$executeRawUnsafe = original.executeRawUnsafe;
    delegates.forEach((delegate, index) => { delegate.count = original.counts[index]; });
    if (oldJwtSecret === undefined) delete runtimeEnv.JWT_SECRET;
    else runtimeEnv.JWT_SECRET = oldJwtSecret;
  }
}

void run().then(() => {
  console.log('Admin schema diagnostic authorization and read-only tests passed.');
}).catch((error) => {
  console.error(error instanceof Error ? error.message : 'Admin schema diagnostic tests failed.');
  process.exitCode = 1;
});
