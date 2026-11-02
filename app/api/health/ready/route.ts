import { db } from '@/lib/db';
import {
  getSafeErrorType,
  logStructured,
  withApiRequestLogging,
} from '@/lib/observability/structuredLogger';

export const dynamic = 'force-dynamic';

export const GET = withApiRequestLogging(
  '/api/health/ready',
  async (_request, context) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return Response.json(
        { status: 'ready' },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    } catch (error) {
      logStructured('error', 'health.dependency.unavailable', {
        ...context,
        dependency: 'database',
        errorType: getSafeErrorType(error),
      });
      return Response.json(
        { status: 'not_ready' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } },
      );
    }
  },
  { logSuccessfulResponses: false },
);
