import crypto from 'crypto';

export type JwtPayload = {
  id?: string;
  userId?: string;
  agentId?: string;
  phone?: string;
  name?: string;
  email?: string;
  role: string;
  tokenVersion?: number;
  exp?: number;
  iat?: number;
};

function getSecret(): string {
  const s = process.env.JWT_SECRET || '';
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET must be configured with at least 32 bytes');
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(payload: any): string {
  const key = getSecret();
  const now = Math.floor(Date.now() / 1000);
  const full: any = {
    userId: payload.userId || payload.id,
    id: payload.id || payload.userId,
    agentId: payload.agentId,
    phone: payload.phone,
    name: payload.name,
    email: payload.email,
    role: payload.role,
    tokenVersion: payload.tokenVersion ?? 1,
    iat: now,
    exp: payload.exp || now + 7 * 24 * 3600,
  };
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(full));
  const sig = crypto.createHmac('sha256', key).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): any {
  const secret = getSecret();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const expected = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return null;
    if (!crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf-8'));
    if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) return null;
    if (payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (e) {
    if (e instanceof Error && e.message.includes('JWT_SECRET')) throw e;
    return null;
  }
}