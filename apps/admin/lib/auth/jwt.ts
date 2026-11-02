import { createHmac, timingSafeEqual } from 'crypto';
import { getJwtSecret } from '../../../../lib/auth/jwtSecret';

export interface JwtPayload {
  userId: string;
  phone: string;
  name?: string | null;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';
  customerId?: string | null;
  agentId?: string | null;
  adminId?: string | null;
  iat?: number;
  exp: number;
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function verifyToken(token: string): JwtPayload | null {
  const secret = getJwtSecret();
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', secret)
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const expiresAt = payload.exp;
    if (typeof expiresAt !== 'number' || !Number.isFinite(expiresAt)) return null;
    if (expiresAt <= Date.now() / 1000) return null;

    return payload;
  } catch (err) {
    return null;
  }
}
