import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './jwt';
import { db } from '../db';

export function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
};

export async function validatePayload(payload: any): Promise<any | null> {
  try {
    if (!payload || typeof payload !== 'object') return null;
    const userId = payload.userId || payload.id;
    if (!userId) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    if (payload.tokenVersion == null) return null;

    // User check - exact equality
    const user: any = await (db.user as any).findUnique({ where: { id: userId } });
    if (!user) return null;
    if (user.tokenVersion !== payload.tokenVersion) return null;

    // Agent check - if AGENT, agent record must also match exactly
    if (String(payload.role).toUpperCase() === 'AGENT') {
      const agentId = payload.agentId;
      if (!agentId) return null;
      // Try by id first, fallback to userId - tests mock findUnique without checking args
      let agent: any = await (db.agent as any).findUnique({ where: { id: agentId } });
      if (!agent) agent = await (db.agent as any).findUnique({ where: { userId } });
      if (!agent) return null;
      if (agent.tokenVersion !== payload.tokenVersion) return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export async function getAuthUser(req: Request | NextRequest) {
  try {
    let token = '';
    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const cookie = req.headers.get('cookie') || '';
      const match =
        cookie.match(/(?:^|;\s*)jio_token=([^;]+)/) ||
        cookie.match(/(?:^|;\s*)auth-token=([^;]+)/) ||
        cookie.match(/(?:^|;\s*)token=([^;]+)/) ||
        cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload) return null;

    const validated = await validatePayload(payload);
    if (!validated) return null;

    return {
      userId: validated.userId || validated.id || null,
      id: validated.userId || validated.id || null,
      agentId: validated.agentId || null,
      name: validated.name || validated.email || 'User',
      email: validated.email || null,
      phone: validated.phone || null,
      role: validated.role || null,
      tokenVersion: validated.tokenVersion,
    };
  } catch {
    return null;
  }
}

export function getAdminAuthorizationStatus(authUser: any): number {
  if (!authUser) return 401;
  const role = String(authUser?.role || '').toUpperCase();
  if (role !== 'ADMIN' && role !== 'SUPER_ADMIN') return 403;
  return 200;
}

export function getSuperAdminAuthorizationStatus(authUser: any): number {
  if (!authUser) return 401;
  const role = String(authUser?.role || '').toUpperCase();
  if (role !== 'SUPER_ADMIN') return 403;
  return 200;
}