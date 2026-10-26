import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const database = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: database }));

import { GET as getLiveHealth } from '@/app/api/health/live/route';
import { GET as getReadyHealth } from '@/app/api/health/ready/route';

describe('health routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('liveness succeeds without querying the database', async () => {
    database.$queryRaw.mockRejectedValue(new Error('database unavailable'));

    const response = await getLiveHealth(new Request('http://localhost/api/health/live', {
      headers: { 'x-request-id': 'a12fc2e7-46df-45c0-8dc5-31a8b98573f8' },
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'alive' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toBe('a12fc2e7-46df-45c0-8dc5-31a8b98573f8');
    expect(database.$queryRaw).not.toHaveBeenCalled();
  });

  test('readiness succeeds only after a database query succeeds', async () => {
    database.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

    const response = await getReadyHealth(new Request('http://localhost/api/health/ready'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ready' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/i);
    expect(database.$queryRaw).toHaveBeenCalledTimes(1);
  });

  test('readiness returns a generic 503 and logs no database details on failure', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    database.$queryRaw.mockRejectedValue(new Error('postgres://private-user:private-password@db.internal'));

    const response = await getReadyHealth(new Request('http://localhost/api/health/ready', {
      headers: { 'x-request-id': 'c5f2f24e-e6fb-45e7-9e83-78920f75e57b' },
    }));
    const responseText = await response.text();
    const emittedLogs = errorLog.mock.calls.map(([line]) => String(line)).join('\n');

    expect(response.status).toBe(503);
    expect(responseText).toBe('{"status":"not_ready"}');
    expect(responseText).not.toContain('private-password');
    expect(emittedLogs).toContain('"event":"health.dependency.unavailable"');
    expect(emittedLogs).toContain('"dependency":"database"');
    expect(emittedLogs).toContain('"requestId":"c5f2f24e-e6fb-45e7-9e83-78920f75e57b"');
    expect(emittedLogs).not.toContain('private-password');
  });
});
