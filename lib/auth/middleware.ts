import { NextRequest } from 'next/server';
import { verifyToken, JwtPayload } from './jwt';
import { db } from '../db';
import { isAdminPrincipal } from './accessPolicy';
import { validateAgentTokenVersion } from './agentTokenVersion';

async function validatePayload(payload: JwtPayload | null): Promise<JwtPayload | null> {
  if (!payload) return null;

  return validateAgentTokenVersion(payload, async (agentId) => {
    const agent = await db.agent.findUnique({
      where: { id: agentId },
      select: { tokenVersion: true } as any,
    });
    return agent ? (agent as any).tokenVersion ?? 1 : null;
  });
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
  return Boolean(user && isAdminPrincipal(user.role));
}

export function requireAdminUser(user: JwtPayload | null): JwtPayload | null {
  return isAdminRole(user) ? user : null;
}
