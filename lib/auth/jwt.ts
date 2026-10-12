import { createHmac, timingSafeEqual } from 'crypto';

export interface JwtPayload {
  userId: string;
  phone: string;
  name?: string | null;
  role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';
  customerId?: string | null;
  agentId?: string | null;
  adminId?: string | null;
  tokenVersion?: number;
  iat?: number;
  exp?: number;
}

function getJwtSecret(): string {
  const secret =
    process.env.JWT_SECRET?.trim() ||
    process.env.RAZORPAY_SECRET?.trim() ||
    process.env.PAYMENT_KEY_SECRET?.trim() ||
    'junkitout_production_jwt_fallback_secret_key_2026';
  return secret;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

export function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>, expiresInDays = 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const exp = now + expiresInDays * 24 * 60 * 60;

  const fullPayload: JwtPayload = {
    ...payload,
    iat: now,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = createHmac('sha256', getJwtSecret())
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${dataToSign}.${signature}`;
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, signature] = parts;
    const dataToSign = `${encodedHeader}.${encodedPayload}`;

    const expectedSignature = createHmac('sha256', getJwtSecret())
      .update(dataToSign)
      .digest('base64')
      .replace(/=/g, '')
      .replace(/\+/g, '-')
      .replace(/\//g, '_');

    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;

    const payload: JwtPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) return null;

    return payload;
  } catch (err) {
    return null;
  }
}
