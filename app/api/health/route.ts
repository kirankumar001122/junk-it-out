import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

function requestIdFrom(req: NextRequest): string {
  const raw = req.headers.get("x-request-id") || "";
  const SAFE_REGEX = /^[a-zA-Z0-9-_]{1,64}$/;
  if (SAFE_REGEX.test(raw)) {
    return raw;
  }
  return crypto.randomUUID();
}

function healthResponse(
  requestId: string,
  status: "ok" | "degraded",
  database: "ok" | "unavailable",
  httpStatus: number
) {
  return NextResponse.json(
    {
      status,
      service: "junk-it-out-api",
      checks: { database },
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      requestId,
    },
    {
      status: httpStatus,
      headers: { "x-request-id": requestId },
    }
  );
}

export async function GET(req: NextRequest) {
  const requestId = requestIdFrom(req);
  try {
    await db.$queryRaw`SELECT 1`;
    return healthResponse(requestId, "ok", "ok", 200);
  } catch (error) {
    return healthResponse(requestId, "degraded", "unavailable", 503);
  }
}