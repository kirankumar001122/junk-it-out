import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getHealth } from '../app/api/health/route';
import { db } from '../lib/db';

const database = db as unknown as {
  $queryRaw: (...args: unknown[]) => Promise<unknown>;
};

const originalQueryRaw = database.$queryRaw;

beforeEach(() => {
  database.$queryRaw = async () => [{ '?column?': 1 }];
});

afterEach(() => {
  database.$queryRaw = originalQueryRaw;
});

test('health endpoint reports readiness without authentication', async () => {
  const response = await getHealth(new NextRequest('http://localhost/api/health', {
    headers: { 'X-Request-Id': 'health-test-1' },
  }));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('x-request-id'), 'health-test-1');
  const body = await response.json();
  assert.equal(body.status, 'ok');
  assert.equal(body.service, 'junk-it-out-api');
  assert.deepEqual(body.checks, { database: 'ok' });
  assert.match(body.timestamp, /^\d{4}-\d{2}-\d{2}T/);
});

test('health endpoint returns a sanitized 503 when the database is unavailable', async () => {
  database.$queryRaw = async () => {
    throw new Error('connection string must not be returned');
  };

  const response = await getHealth(new NextRequest('http://localhost/api/health'));
  const body = await response.json();

  assert.equal(response.status, 503);
  assert.equal(body.status, 'degraded');
  assert.deepEqual(body.checks, { database: 'unavailable' });
  assert.doesNotMatch(JSON.stringify(body), /connection string/);
  assert.match(response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/);

});

test('health endpoint replaces an unsafe request ID before returning it', async () => {
  const response = await getHealth(new NextRequest('http://localhost/api/health', {
    headers: { 'X-Request-Id': 'unsafe value' },
  }));

  assert.equal(response.status, 200);
  assert.notEqual(response.headers.get('x-request-id'), 'unsafe value');
  assert.match(response.headers.get('x-request-id') || '', /^[0-9a-f-]{36}$/);
});
