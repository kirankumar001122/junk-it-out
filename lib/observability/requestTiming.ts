import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';

type TimingContext = {
  requestId: string;
  checkoutFlowId: string | null;
  route: string;
  startedAt: number;
};

type TimingFields = {
  durationMs?: number;
  outcome?: 'success' | 'error';
  status?: number;
  errorType?: string;
  socketReused?: boolean;
};

const timingContext = new AsyncLocalStorage<TimingContext>();
const checkoutFlowIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeErrorTypes = new Set([
  'AbortError',
  'AggregateError',
  'Error',
  'PrismaClientInitializationError',
  'PrismaClientKnownRequestError',
  'PrismaClientUnknownRequestError',
  'PrismaClientValidationError',
  'RazorpayApiError',
  'RazorpayOrderCreationError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'TimeoutError',
  'TypeError',
  'URIError',
]);

export function isValidCheckoutFlowId(value: string | null | undefined): value is string {
  return Boolean(value && checkoutFlowIdPattern.test(value));
}

export function monotonicNow(): number {
  return performance.now();
}

export function getCurrentRequestId(): string | undefined {
  return timingContext.getStore()?.requestId;
}

function safeErrorType(error: unknown): string {
  if (!(error instanceof Error)) return 'UnknownError';
  return safeErrorTypes.has(error.name) ? error.name : 'UnknownError';
}

export function recordTiming(phase: string, fields: TimingFields = {}): void {
  const context = timingContext.getStore();
  if (!context || !/^[a-z0-9._-]{1,100}$/.test(phase)) return;

  try {
    console.info(JSON.stringify({
      event: 'request_timing',
      requestId: context.requestId,
      checkoutFlowId: context.checkoutFlowId,
      route: context.route,
      phase,
      elapsedMs: Number((performance.now() - context.startedAt).toFixed(2)),
      ...fields,
    }));
  } catch {
    // Instrumentation must not change the observed operation.
  }
}

export async function measureTiming<T>(
  phase: string,
  operation: () => Promise<T>,
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await operation();
    recordTiming(phase, {
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      outcome: 'success',
    });
    return result;
  } catch (error) {
    recordTiming(phase, {
      durationMs: Number((performance.now() - startedAt).toFixed(2)),
      outcome: 'error',
      errorType: safeErrorType(error),
    });
    throw error;
  }
}

export async function withRequestTiming<T extends Response>(
  request: Request,
  route: string,
  handler: () => Promise<T>,
): Promise<T> {
  const requestId = randomUUID();
  const incomingFlowId = request.headers.get('x-checkout-flow-id');
  const checkoutFlowId = isValidCheckoutFlowId(incomingFlowId)
    ? incomingFlowId.toLowerCase()
    : null;
  const context: TimingContext = {
    requestId,
    checkoutFlowId,
    route,
    startedAt: performance.now(),
  };
  request.headers.set('x-request-id', requestId);

  return timingContext.run(context, async () => {
    try {
      const response = await handler();
      response.headers.set('X-Request-ID', requestId);
      if (checkoutFlowId) {
        response.headers.set('X-Checkout-Flow-ID', checkoutFlowId);
      }
      recordTiming('request.completed', {
        durationMs: Number((performance.now() - context.startedAt).toFixed(2)),
        outcome: 'success',
        status: response.status,
      });
      return response;
    } catch (error) {
      recordTiming('request.failed', {
        durationMs: Number((performance.now() - context.startedAt).toFixed(2)),
        outcome: 'error',
        errorType: safeErrorType(error),
      });
      throw error;
    }
  });
}
