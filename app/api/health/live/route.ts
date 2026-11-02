import { withApiRequestLogging } from '@/lib/observability/structuredLogger';

export const dynamic = 'force-dynamic';

export const GET = withApiRequestLogging(
  '/api/health/live',
  async () => Response.json(
    { status: 'alive' },
    { headers: { 'Cache-Control': 'no-store' } },
  ),
  { logSuccessfulResponses: false },
);
