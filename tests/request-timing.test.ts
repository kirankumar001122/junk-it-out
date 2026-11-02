import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getCurrentRequestId,
  measureTiming,
  recordTiming,
  withRequestTiming,
} from '../lib/observability/requestTiming';
import { withApiRequestLogging } from '../lib/observability/structuredLogger';

const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

afterEach(() => {
  infoSpy.mockClear();
  errorSpy.mockClear();
});

function timingLogs() {
  return infoSpy.mock.calls.map(([line]) => JSON.parse(String(line)));
}

describe('payment request timing instrumentation', () => {
  it('creates unique server IDs, validates flow IDs, and returns correlation headers', async () => {
    const flowId = '83b36ed0-50e7-4ee7-8103-34e70cdf4b7a';
    const makeRequest = (checkoutFlowId: string) => new Request('http://localhost/api/test', {
      headers: { 'X-Checkout-Flow-ID': checkoutFlowId },
    });

    const first = await withRequestTiming(makeRequest(flowId), 'GET /api/test', async () =>
      Response.json({ success: true }),
    );
    const second = await withRequestTiming(
      makeRequest('invalid-flow-id'),
      'GET /api/test',
      async () => Response.json({ success: true }),
    );
    const firstRequestId = first.headers.get('X-Request-ID');
    const secondRequestId = second.headers.get('X-Request-ID');

    expect(firstRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondRequestId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(firstRequestId).not.toBe(secondRequestId);
    expect(first.headers.get('X-Checkout-Flow-ID')).toBe(flowId);
    expect(second.headers.has('X-Checkout-Flow-ID')).toBe(false);
  });

  it('uses monotonic phase durations and joins API logs to the server request ID', async () => {
    const request = new Request('http://localhost/api/test', {
      headers: { 'X-Request-ID': 'a12fc2e7-46df-45c0-8dc5-31a8b98573f8' },
    });
    const loggedHandler = withApiRequestLogging('/api/test', async () =>
      Response.json({ success: true }),
    );
    const response = await withRequestTiming(request, 'GET /api/test', async () => {
      await measureTiming('database.query', async () => true);
      return loggedHandler(request);
    });
    const logs = timingLogs();
    const requestId = response.headers.get('X-Request-ID');

    expect(logs.some((entry) =>
      entry.phase === 'database.query' &&
      entry.durationMs >= 0 &&
      entry.outcome === 'success',
    )).toBe(true);
    expect(logs.at(-1)).toMatchObject({
      phase: 'request.completed',
      outcome: 'success',
      status: 200,
      requestId,
    });
    expect(infoSpy.mock.calls.some(([line]) =>
      JSON.parse(String(line)).requestId === requestId,
    )).toBe(true);
    expect(getCurrentRequestId()).toBeUndefined();
  });

  it('keeps structured logging free of Node-only request context imports', async () => {
    const source = await import('node:fs/promises').then(({ readFile }) =>
      readFile(new URL('../lib/observability/structuredLogger.ts', import.meta.url), 'utf8'),
    );

    expect(source).not.toMatch(/from\s+['"]node:/);
    expect(source).not.toContain("from './requestTiming'");
  });

  it('records safe error metadata without request bodies or error messages', async () => {
    const secrets = [
      'customer@example.invalid',
      '9999999999',
      'otp-123456',
      'bearer-sensitive-token',
      'razorpay-signature-private',
      'private-secret-value',
    ];
    const request = new Request('http://localhost/api/test', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secrets[3]}`,
        'X-Checkout-Flow-ID': 'f7bbd177-3a4b-4ed1-9cab-b67b32e11abc',
      },
      body: JSON.stringify({
        email: secrets[0],
        phone: secrets[1],
        otp: secrets[2],
        signature: secrets[4],
        secret: secrets[5],
      }),
    });

    await expect(withRequestTiming(request, 'POST /api/test', async () => {
      recordTiming('request.body_not_logged');
      throw new Error(secrets[5]);
    })).rejects.toThrow(secrets[5]);

    const logs = timingLogs();
    expect(logs.at(-1)).toMatchObject({
      phase: 'request.failed',
      outcome: 'error',
      errorType: 'Error',
    });
    const serialized = JSON.stringify(logs);
    for (const secret of secrets) {
      expect(serialized).not.toContain(secret);
    }
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('does not log phases outside an instrumented request context', () => {
    recordTiming('unscoped.phase');
    expect(timingLogs()).toHaveLength(0);
  });
});
