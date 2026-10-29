import type { Instrumentation } from 'next';
import {
  getOrCreateRequestId,
  getSafeErrorDependency,
  getSafeErrorType,
  logStructured,
} from './lib/observability/structuredLogger';

export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (context.routeType !== 'route') return;

  const suppliedRequestId = request.headers['x-request-id'];

  logStructured('error', 'api.request.unhandled_error', {
    requestId: getOrCreateRequestId(suppliedRequestId),
    route: context.routePath,
    method: request.method,
    statusCode: 500,
    errorType: getSafeErrorType(error),
    dependency: getSafeErrorDependency(error),
  });
};
