import { afterEach, describe, expect, test, vi } from 'vitest';
import { onRequestError } from '@/instrumentation';

describe('request error instrumentation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('logs a route template and safe failure fields without request details', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await onRequestError(
      new Error('private connection details'),
      {
        path: '/api/orders/private-order?token=query-secret',
        method: 'POST',
        headers: {
          'x-request-id': 'a12fc2e7-46df-45c0-8dc5-31a8b98573f8',
          authorization: 'Bearer private-token',
        },
      },
      {
        routerKind: 'App Router',
        routePath: '/api/orders/[id]',
        routeType: 'route',
        renderSource: 'server-rendering',
        revalidateReason: undefined,
      },
    );

    const serialized = String(errorLog.mock.calls[0][0]);
    expect(JSON.parse(serialized)).toMatchObject({
      severity: 'error',
      event: 'api.request.unhandled_error',
      requestId: 'a12fc2e7-46df-45c0-8dc5-31a8b98573f8',
      route: '/api/orders/[id]',
      method: 'POST',
      statusCode: 500,
      errorType: 'Error',
    });
    expect(serialized).not.toContain('private-order');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('private-token');
    expect(serialized).not.toContain('private connection details');
  });

  test('ignores non-route failures', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});

    await onRequestError(
      new Error('page rendering failure'),
      { path: '/private-path', method: 'GET', headers: {} },
      {
        routerKind: 'App Router',
        routePath: '/private-page',
        routeType: 'render',
        renderSource: 'server-rendering',
        revalidateReason: undefined,
      },
    );

    expect(errorLog).not.toHaveBeenCalled();
  });
});
