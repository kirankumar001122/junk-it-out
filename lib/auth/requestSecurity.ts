import { createHash } from 'crypto';
import { NextRequest } from 'next/server';

export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function opaqueKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Blocks browser cross-origin login requests while allowing non-browser clients. */
export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  const host = request.headers.get('host');
  if (!host) return false;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() === host.toLowerCase()) return true;
  } catch {}

  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return origin === `${protocol}://${host}`;
}
