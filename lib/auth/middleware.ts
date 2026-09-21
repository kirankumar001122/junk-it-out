import { NextRequest } from 'next/server';
import { verifyToken, JwtPayload } from './jwt';
import { db } from '../db';

async function validatePayload(payload: JwtPayload | null): Promise<JwtPayload | null> {
  if (!payload) return null;

  if (payload.role === 'AGENT' && payload.agentId) {
    try {
      const agent = await db.agent.findUnique({
        where: { id: payload.agentId },
        select: { tokenVersion: true } as any,
      });
      if (!agent) return null;
      const currentDbVersion = (agent as any).tokenVersion ?? 1;
      const tokenVersion = payload.tokenVersion ?? 1;
      if (tokenVersion < currentDbVersion) {
        return null;
      }
    } catch (e) {
      console.error('Agent token version check error:', e);
    }
  }

  return payload;
}

export async function getAuthUser(req: NextRequest): Promise<JwtPayload | null> {
  // Check Authorization Header (Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) return validatePayload(payload);
  }

  // Check Cookies for `jio_token`
  const tokenCookie = req.cookies.get('jio_token')?.value;
  if (tokenCookie) {
    const payload = verifyToken(tokenCookie);
    if (payload) return validatePayload(payload);
  }

  return null;
}

export function hasRole(user: JwtPayload | null, allowedRoles: string[]): boolean {
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN') return true;
  return allowedRoles.includes(user.role);
}

export function isAdminRole(user: JwtPayload | null): boolean {
  return hasRole(user, ['ADMIN', 'SUPER_ADMIN']);
}

export function requireAdminUser(user: JwtPayload | null): JwtPayload | null {
  return isAdminRole(user) ? user : null;
}
