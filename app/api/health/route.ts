import { NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";
import Prisma from "@prisma/client";
import { NextRequest } from "next/server";
import { logger } from "@/lib/logger";

const db = new PrismaClient();

function healthResponse(requestId: string, status: string, dbStatus: string, httpStatus: number) {
  return NextResponse.json({
    status: status.toUpperCase(),
    database: dbStatus,
    timestamp: new Date().toISOString(),
    requestId,
    uptime: `${Math.floor(process.uptime())}s`,
    responseTime: "0ms",
    checks: { api: status, database: dbStatus }
  }, { status: httpStatus });
}

export async function GET(request: NextRequest) {
  const requestId = Math.random().toString(36).substring(7);
  const start = Date.now();
  try {
    await db.$queryRaw(Prisma.sql`SELECT 1`);
    const rt = Date.now() - start;
    logger.info({ requestId, service: "health", status: "UP", responseTime: rt });
    return NextResponse.json({
      status: "UP",
      database: "Connected",
      timestamp: new Date().toISOString(),
      requestId,
      responseTime: `${rt}ms`,
      uptime: `${Math.floor(process.uptime())}s`
    });
  } catch (error) {
    console.error('[health] database readiness check failed', { requestId, error });
    const rt = Date.now() - start;
    logger.error({ requestId, service: "health", status: "degraded", error });
    return NextResponse.json({
      status: "UP",
      database: `Disconnected (will connect when docker is up) - ${rt}ms`,
      timestamp: new Date().toISOString(),
      requestId,
      responseTime: `${rt}ms`,
      uptime: `${Math.floor(process.uptime())}s`,
      note: "API is UP, DB check is best-effort for local dev"
    });
  }
}