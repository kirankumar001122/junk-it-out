import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';

export function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

export function opaqueKey(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Validates whether an Origin header matches authorized Junk It Out domains. */
export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  const lower = origin.toLowerCase();
  const allowed = [
    'https://www.junkitout.in',
    'https://junkitout.in',
    'https://admin.junkitout.in',
  ];
  if (process.env.NODE_ENV !== 'production') {
    allowed.push('http://localhost:3000', 'http://localhost:3001', 'http://127.0.0.1:3000', 'http://127.0.0.1:3001');
  }
  return allowed.includes(lower);
}

/** Blocks untrusted browser cross-origin login requests while allowing authorized subdomains & non-browser clients. */
export function hasTrustedOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  if (isAllowedOrigin(origin)) return true;

  const host = request.headers.get('host');
  if (!host) return false;

  try {
    const originUrl = new URL(origin);
    if (originUrl.host.toLowerCase() === host.toLowerCase()) return true;
  } catch {}

  const protocol = request.headers.get('x-forwarded-proto') || (process.env.NODE_ENV === 'production' ? 'https' : 'http');
  return origin === `${protocol}://${host}`;
}

export function addCorsHeaders(response: NextResponse, request: NextRequest): NextResponse {
  const origin = request.headers.get('origin');
  if (origin && isAllowedOrigin(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Credentials', 'true');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }
  return response;
}
