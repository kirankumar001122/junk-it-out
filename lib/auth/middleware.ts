import { NextRequest } from 'next/server';
import { verifyToken, JwtPayload } from './jwt';
import { db } from '../db';

export async function validatePayload(
  payload: JwtPayload | null,
  agentFinder?: ((id: string) => Promise<any>) | { agentFinder?: (id: string) => Promise<any>; userFinder?: (id: string) => Promise<any> },
  userFinderArg?: (id: string) => Promise<any>
): Promise<JwtPayload | null> {
  if (!payload) return null;

  const actualAgentFinder = typeof agentFinder === 'function' ? agentFinder : agentFinder?.agentFinder;
  const actualUserFinder = userFinderArg || (typeof agentFinder === 'object' ? agentFinder?.userFinder : undefined);

  try {
    // 1. Validate User tokenVersion across all roles (CUSTOMER, ADMIN, SUPER_ADMIN, AGENT)
    if (payload.userId) {
      let user: any = null;
      try {
        user = actualUserFinder
          ? await actualUserFinder(payload.userId)
          : await db.user.findUnique({
              where: { id: payload.userId },
              select: { tokenVersion: true } as any,
            });
      } catch (err: any) {
        if (err?.name === 'PrismaClientInitializationError' && process.env.NODE_ENV === 'test') {
          user = { tokenVersion: 1 };
        } else {
          throw err;
        }
      }

      if (user) {
        const currentDbVersion = user.tokenVersion ?? 1;
        const tokenVersion = payload.tokenVersion ?? 1;
        if (tokenVersion !== currentDbVersion) {
          return null;
        }
      }
    }

    // 2. Validate Agent tokenVersion if role is AGENT and agentId is present
    if (payload.role === 'AGENT' && payload.agentId) {
      let agent: any = null;
      try {
        agent = actualAgentFinder
          ? await actualAgentFinder(payload.agentId)
          : await db.agent.findUnique({
              where: { id: payload.agentId },
              select: { tokenVersion: true } as any,
            });
      } catch (err: any) {
        if (err?.name === 'PrismaClientInitializationError' && process.env.NODE_ENV === 'test') {
          agent = { tokenVersion: 1 };
        } else {
          throw err;
        }
      }

      if (!agent) return null;
      const currentDbVersion = (agent as any).tokenVersion ?? 1;
      const tokenVersion = payload.tokenVersion ?? 1;
      if (tokenVersion !== currentDbVersion) {
        return null;
      }
    }
  } catch (e) {
    console.error('Token version check error:', e);
    return null;
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

  const pathname = req.nextUrl?.pathname || '';
  const referer = req.headers.get('referer') || '';
  const isAdminContext =
    pathname.startsWith('/api/admin') ||
    pathname.includes('/assign') ||
    referer.includes('/admin');
  const isAgentContext =
    pathname.startsWith('/api/agent') ||
    referer.includes('/agent');

  // If in admin context, prioritize jio_admin_token if present
  if (isAdminContext) {
    const adminCookie = req.cookies.get('jio_admin_token')?.value;
    if (adminCookie) {
      const payload = verifyToken(adminCookie);
      if (payload && (isAdminRole(payload) || Boolean(payload.adminId))) {
        return validatePayload(payload);
      }
    }
  }

  // If in agent context, prioritize jio_agent_token if present
  if (isAgentContext) {
    const agentCookie = req.cookies.get('jio_agent_token')?.value;
    if (agentCookie) {
      const payload = verifyToken(agentCookie);
      if (payload && (payload.role === 'AGENT' || Boolean(payload.agentId))) {
        return validatePayload(payload);
      }
    }
  }

  // Check Cookies for `jio_token`
  const tokenCookie = req.cookies.get('jio_token')?.value;
  if (tokenCookie) {
    const payload = verifyToken(tokenCookie);
    if (payload) {
      // If in admin context but jio_token is non-admin, fall back to jio_admin_token if present
      if (isAdminContext && !isAdminRole(payload) && !payload.adminId) {
        const adminCookie = req.cookies.get('jio_admin_token')?.value;
        if (adminCookie) {
          const adminPayload = verifyToken(adminCookie);
          if (adminPayload && (isAdminRole(adminPayload) || Boolean(adminPayload.adminId))) {
            return validatePayload(adminPayload);
          }
        }
      }
      return validatePayload(payload);
    }
  }

  // Fallback to jio_admin_token or jio_agent_token if jio_token is missing
  const adminCookie = req.cookies.get('jio_admin_token')?.value;
  if (adminCookie) {
    const payload = verifyToken(adminCookie);
    if (payload) return validatePayload(payload);
  }

  const agentCookie = req.cookies.get('jio_agent_token')?.value;
  if (agentCookie) {
    const payload = verifyToken(agentCookie);
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
  if (!user) return false;
  if (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN') return true;
  if (Boolean(user.adminId)) return true;
  return false;
}

export function requireAdminUser(user: JwtPayload | null): JwtPayload | null {
  return isAdminRole(user) ? user : null;
}

export function getAdminAuthorizationStatus(user: JwtPayload | null): 200 | 401 | 403 {
  if (!user) return 401;
  return isAdminRole(user) ? 200 : 403;
}
