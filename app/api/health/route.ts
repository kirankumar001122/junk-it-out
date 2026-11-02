import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

function requestIdFrom(request: NextRequest): string {
  const supplied = request.headers.get('x-request-id')?.trim();
  return supplied && supplied.length <= 128 && /^[A-Za-z0-9._:-]+$/.test(supplied)
    ? supplied
    : randomUUID();
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
      timestamp: new Date().toISOString(),
    },
    {
      status: httpStatus,
      headers: {
        'Cache-Control': 'no-store',
        'X-Request-Id': requestId,
      },
    },
  );
}

export async function GET(request: NextRequest) {
  const requestId = requestIdFrom(request);

  try {
    await db.$queryRaw(Prisma.sql`SELECT 1`);
    return healthResponse(requestId, 'ok', 'ok', 200);
  } catch (error) {
    console.error('[health] database readiness check failed', {
      requestId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    return healthResponse(requestId, 'degraded', 'unavailable', 503);
  }
}
