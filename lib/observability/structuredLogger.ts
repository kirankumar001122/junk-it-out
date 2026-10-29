export type LogSeverity = 'info' | 'warn' | 'error';
export type LogDependency = 'database' | 'razorpay' | 'fast2sms' | 'blob';

export interface StructuredLogFields {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  dependency?: LogDependency;
  errorType?: string;
  prismaCode?: string;
  databaseCode?: string;
  databaseModel?: string;
  databaseAction?: string;
  providerStatusCode?: number;
}

export interface ApiRequestContext {
  requestId: string;
  route: string;
  method: string;
}

type LoggedRouteHandler<TRequest extends Request> = (
  request: TRequest,
  context: ApiRequestContext,
) => Response | Promise<Response>;

const REQUEST_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EVENT_PATTERN = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const HTTP_METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const SAFE_ERROR_TYPES = new Set([
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'AggregateError',
  'AbortError',
  'TimeoutError',
  'FetchError',
  'ZodError',
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientInitializationError',
  'PrismaClientValidationError',
  'RazorpayApiError',
  'RazorpayOrderCreationError',
  'RazorpayRefundError',
]);

export function getRequestId(headers: Headers): string {
  return getOrCreateRequestId(headers.get('x-request-id'));
}

export function getOrCreateRequestId(value: unknown): string {
  if (typeof value !== 'string') return globalThis.crypto.randomUUID();
  const suppliedId = value.trim();
  return REQUEST_ID_PATTERN.test(suppliedId) ? suppliedId : globalThis.crypto.randomUUID();
}

export function getSafeErrorType(error: unknown): string {
  try {
    if (!(error instanceof Error)) return 'UnknownError';
    return sanitizeErrorType(error.name);
  } catch {
    return 'UnknownError';
  }
}

export function getSafePrismaCode(error: unknown): string | undefined {
  try {
    if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
    const code = error.code;
    return typeof code === 'string' && /^P\d{4}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

export function getSafeDatabaseCode(error: unknown): string | undefined {
  try {
    if (typeof error !== 'object' || error === null || !('meta' in error)) return undefined;
    const meta = error.meta;
    if (typeof meta !== 'object' || meta === null || !('code' in meta)) return undefined;
    const code = meta.code;
    return typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function sanitizeErrorType(errorType: string): string {
  return SAFE_ERROR_TYPES.has(errorType) ? errorType : 'UnknownError';
}

export function getSafeErrorDependency(error: unknown): LogDependency | undefined {
  const errorType = getSafeErrorType(error);
  if (errorType.startsWith('Prisma')) return 'database';
  if (errorType.startsWith('Razorpay')) return 'razorpay';
  return undefined;
}

export async function withDatabaseErrorLogging<T>(
  operation: () => Promise<T>,
  context: { databaseModel?: unknown; databaseAction?: unknown } = {},
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    logStructured('error', 'database.operation.failed', {
      dependency: 'database',
      errorType: getSafeErrorType(error),
      prismaCode: getSafePrismaCode(error),
      databaseCode: getSafeDatabaseCode(error),
      databaseModel: sanitizeDatabaseIdentifier(context.databaseModel),
      databaseAction: sanitizeDatabaseIdentifier(context.databaseAction),
    });
    throw error;
  }
}

function sanitizeDatabaseIdentifier(value: unknown): string | undefined {
  return typeof value === 'string' && /^[A-Za-z$][A-Za-z0-9_$]{0,63}$/.test(value)
    ? value
    : undefined;
}

export function logStructured(
  severity: LogSeverity,
  event: string,
  fields: StructuredLogFields = {},
): void {
  try {
    const normalizedEvent = EVENT_PATTERN.test(event) ? event : 'application.event';
    const entry = {
      timestamp: new Date().toISOString(),
      severity,
      event: normalizedEvent,
      ...(fields.requestId && REQUEST_ID_PATTERN.test(fields.requestId)
        ? { requestId: fields.requestId }
        : {}),
      ...(fields.route ? { route: fields.route } : {}),
      ...(fields.method && HTTP_METHODS.has(fields.method)
        ? { method: fields.method }
        : {}),
      ...(Number.isInteger(fields.statusCode) ? { statusCode: fields.statusCode } : {}),
      ...(Number.isFinite(fields.durationMs) && fields.durationMs! >= 0
        ? { durationMs: Math.round(fields.durationMs!) }
        : {}),
      ...(fields.dependency ? { dependency: fields.dependency } : {}),
      ...(fields.errorType ? { errorType: sanitizeErrorType(fields.errorType) } : {}),
      ...(fields.prismaCode && /^P\d{4}$/.test(fields.prismaCode)
        ? { prismaCode: fields.prismaCode }
        : {}),
      ...(fields.databaseCode && /^[0-9A-Z]{5}$/.test(fields.databaseCode)
        ? { databaseCode: fields.databaseCode }
        : {}),
      ...(fields.databaseModel && /^[A-Za-z$][A-Za-z0-9_$]{0,63}$/.test(fields.databaseModel)
        ? { databaseModel: fields.databaseModel }
        : {}),
      ...(fields.databaseAction && /^[A-Za-z$][A-Za-z0-9_$]{0,63}$/.test(fields.databaseAction)
        ? { databaseAction: fields.databaseAction }
        : {}),
      ...(Number.isInteger(fields.providerStatusCode)
        ? { providerStatusCode: fields.providerStatusCode }
        : {}),
    };

    const serialized = JSON.stringify(entry);
    if (severity === 'error') console.error(serialized);
    else if (severity === 'warn') console.warn(serialized);
    else console.info(serialized);
  } catch {
    // Logging must not change the response or provider operation being observed.
  }
}

export function withApiRequestLogging<TRequest extends Request>(
  route: string,
  handler: LoggedRouteHandler<TRequest>,
  options: { logSuccessfulResponses?: boolean } = {},
): (request: TRequest) => Promise<Response> {
  return async (request) => {
    const startedAt = Date.now();
    const context: ApiRequestContext = {
      requestId: getRequestId(request.headers),
      route,
      method: HTTP_METHODS.has(request.method) ? request.method : 'OTHER',
    };

    try {
      const response = await handler(request, context);
      const durationMs = Date.now() - startedAt;
      response.headers.set('x-request-id', context.requestId);

      if (response.status >= 400 || options.logSuccessfulResponses !== false) {
        logStructured(
          response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'info',
          'api.request.completed',
          {
            ...context,
            statusCode: response.status,
            durationMs,
          },
        );
      }

      return response;
    } catch (error) {
      logStructured('error', 'api.request.failed', {
        ...context,
        statusCode: 500,
        durationMs: Date.now() - startedAt,
        errorType: getSafeErrorType(error),
        dependency: getSafeErrorDependency(error),
      });
      throw error;
    }
  };
}
