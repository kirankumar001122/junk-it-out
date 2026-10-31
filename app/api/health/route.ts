import { randomUUID } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function requestIdFrom(req: NextRequest): string {
  return req.headers.get('x-request-id') || randomUUID();
}

function healthResponse(
  requestId: string,
  status: 'ok' | 'degraded',
  database: 'ok' | 'unavailable',
  httpStatus: number,
) {
  return NextResponse.json(
    {
      status,
      service: 'junk-it-out-api',
      checks: { database },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      requestId,
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'x-request-id': requestId,
      },
    },
  );
}

export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req);

  try {
    await db.$queryRaw`SELECT 1`;
    return healthResponse(requestId, 'ok', 'ok', 200);
  } catch (error) {
    console.error('Health check failed:', error);
    return healthResponse(requestId, 'degraded', 'unavailable', 503);
  }
}