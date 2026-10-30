import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";
type Handler = (req: NextRequest, ...args: any[]) => Promise<NextResponse>;
export function withLogging(handler: Handler) {
  return async (req: NextRequest, ...args: any[]) => {
    const start = Date.now();
    try {
      const res = await handler(req, ...args);
      const duration = Date.now() - start;
      logger.info({ method: req.method, url: req.url, status: res.status, responseTime: `${duration}ms` });
      res.headers.set("X-Response-Time", `${duration}ms`);
      return res;
    } catch (err: any) {
      const duration = Date.now() - start;
      logger.error({ method: req.method, url: req.url, error: err.message, responseTime: `${duration}ms` });
      throw err;
    }
  };
}