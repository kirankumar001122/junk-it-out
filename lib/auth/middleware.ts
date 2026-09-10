import { NextRequest } from 'next/server';
import { verifyToken, JwtPayload } from './jwt';
import { db } from '../db';

export async function getAuthUser(req: NextRequest): Promise<JwtPayload | null> {
  // Check Authorization Header (Bearer token)
  const authHeader = req.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (payload) return payload;
  }

  // Check Cookies for `jio_token`
  const tokenCookie = req.cookies.get('jio_token')?.value;
  if (tokenCookie) {
    const payload = verifyToken(tokenCookie);
    if (payload) return payload;
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
