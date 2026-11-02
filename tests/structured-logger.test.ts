import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  getOrCreateRequestId,
  getRequestId,
  getSafeDatabaseCode,
  getSafeErrorType,
  getSafePrismaCode,
  logStructured,
  withDatabaseErrorLogging,
  withApiRequestLogging,
} from '@/lib/observability/structuredLogger';

describe('structured logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('uses only safe incoming request IDs and generates one for invalid values', () => {
    expect(getRequestId(new Headers({ 'x-request-id': 'a12fc2e7-46df-45c0-8dc5-31a8b98573f8' })))
      .toBe('a12fc2e7-46df-45c0-8dc5-31a8b98573f8');
    expect(getRequestId(new Headers({ 'x-request-id': 'token=private-value' }))).toMatch(/^[0-9a-f-]{36}$/i);
    expect(getOrCreateRequestId('a12fc2e7-46df-45c0-8dc5-31a8b98573f8\r\nforged=true'))
      .toMatch(/^[0-9a-f-]{36}$/i);
  });

  test('writes JSON-compatible events with severity and a timestamp', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    logStructured('info', 'payment.provider.failed', {
      dependency: 'razorpay',
      providerStatusCode: 502,
    });

    const event = JSON.parse(String(info.mock.calls[0][0]));
    expect(event).toMatchObject({
      severity: 'info',
      event: 'payment.provider.failed',
      dependency: 'razorpay',
      providerStatusCode: 502,
    });
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false);
  });

  test('does not throw if the logging sink fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('logging sink unavailable');
    });

    expect(() => logStructured('error', 'payment.create.failed')).not.toThrow();
  });

  test('logs database failures without the error message and preserves the rejection', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const databaseError = Object.assign(
      new Error('postgres://private-user:private-password@db.internal'),
      { code: 'P2022' },
    );
    Object.assign(databaseError, { meta: { code: '42883', message: 'private SQL text and parameters' } });

    await expect(withDatabaseErrorLogging(async () => { throw databaseError; }, {
      databaseModel: 'Payment',
      databaseAction: 'create',
    }))
      .rejects.toBe(databaseError);

    const serialized = String(errorLog.mock.calls[0][0]);
    expect(JSON.parse(serialized)).toMatchObject({
      severity: 'error',
      event: 'database.operation.failed',
      dependency: 'database',
      errorType: 'Error',
      prismaCode: 'P2022',
      databaseCode: '42883',
      databaseModel: 'Payment',
      databaseAction: 'create',
    });
    expect(serialized).not.toContain('private-password');
    expect(serialized).not.toContain('db.internal');
    expect(serialized).not.toContain('private SQL text');
  });

  test('exposes only well-formed Prisma codes in safe diagnostics', () => {
    expect(getSafePrismaCode({ code: 'P2002' })).toBe('P2002');
    expect(getSafePrismaCode({ code: 'P2002\nforged=true' })).toBeUndefined();
    expect(getSafePrismaCode(new Error('not a Prisma error'))).toBeUndefined();
  });

  test('exposes only well-formed SQLSTATE values from Prisma metadata', () => {
    expect(getSafeDatabaseCode({ meta: { code: '42883' } })).toBe('42883');
    expect(getSafeDatabaseCode({ meta: { code: '42883\nforged=true' } })).toBeUndefined();
    expect(getSafeDatabaseCode({ meta: { message: 'private query' } })).toBeUndefined();
  });

  test('logs status and duration without recording request body or query data', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const handler = withApiRequestLogging('/api/test', async (_request) =>
      Response.json({ success: true }, { status: 201 }),
    );

    const response = await handler(new Request('http://localhost/api/test?token=query-secret', {
      method: 'POST',
      headers: { 'x-request-id': '25db7e77-1bd3-4a2c-bffe-322a94a30f12' },
      body: 'password=body-secret',
    }));
    const serialized = String(info.mock.calls[0][0]);
    const event = JSON.parse(serialized);

    expect(response.headers.get('x-request-id')).toBe('25db7e77-1bd3-4a2c-bffe-322a94a30f12');
    expect(event).toMatchObject({
      severity: 'info',
      event: 'api.request.completed',
      requestId: '25db7e77-1bd3-4a2c-bffe-322a94a30f12',
      route: '/api/test',
      method: 'POST',
      statusCode: 201,
    });
    expect(typeof event.durationMs).toBe('number');
    expect(serialized).not.toContain('query-secret');
    expect(serialized).not.toContain('body-secret');
  });

  test('records only the error type when a route throws, then rethrows', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const handler = withApiRequestLogging('/api/test', async () => {
      throw new Error('contains a private connection string');
    });

    await expect(handler(new Request('http://localhost/api/test')))
      .rejects.toThrow('contains a private connection string');

    const serialized = String(error.mock.calls[0][0]);
    expect(JSON.parse(serialized)).toMatchObject({
      severity: 'error',
      event: 'api.request.failed',
      errorType: 'Error',
      statusCode: 500,
    });
    expect(serialized).not.toContain('private connection string');
  });

  test('sanitizes nonstandard error names', () => {
    const error = new Error('not logged');
    error.name = 'private message with spaces';
    expect(getSafeErrorType(error)).toBe('UnknownError');

    const unusualError = new Error('not logged');
    Object.defineProperty(unusualError, 'name', { get: () => { throw new Error('access denied'); } });
    expect(getSafeErrorType(unusualError)).toBe('UnknownError');
  });
});
