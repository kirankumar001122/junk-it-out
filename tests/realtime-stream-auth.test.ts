import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getRealtimeStream } from '../app/api/realtime/stream/route';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'realtime-stream-auth-test-secret-at-least-32-bytes';

function request(token?: string) {
  return new NextRequest('http://localhost/api/realtime/stream', {
    headers: token ? { Cookie: `jio_token=${token}` } : undefined,
  });
}

function token(role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN') {
  return signToken({
    userId: `${role.toLowerCase()}-user`,
    phone: '9999999999',
    name: role,
    role,
  });
}

test('global realtime stream requires authentication and admin authorization', async () => {
  assert.equal((await getRealtimeStream(request())).status, 401);
  assert.equal((await getRealtimeStream(request(token('CUSTOMER')))).status, 403);
  assert.equal((await getRealtimeStream(request(token('AGENT')))).status, 403);

  for (const role of ['ADMIN', 'SUPER_ADMIN'] as const) {
    const controller = new AbortController();
    const response = await getRealtimeStream(
      new NextRequest('http://localhost/api/realtime/stream', {
        headers: { Cookie: `jio_token=${token(role)}` },
        signal: controller.signal,
      }),
    );
    assert.equal(response.status, 200);
    assert.ok(response.headers.get('Content-Type')?.startsWith('text/event-stream'));
    controller.abort();
    await response.body?.cancel();
  }
});
