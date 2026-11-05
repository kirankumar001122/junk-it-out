import { NextRequest, NextResponse } from 'next/server';

// ------------------------------------------------
// Existing Next.js middleware - keep as pass-through
// So it does not block any page. Auth is checked
// per-route using getAuthUser() below.
// ------------------------------------------------
export function middleware(req: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/admin/:path*'],
};

// ------------------------------------------------
// getAuthUser(req)
// Returns { userId, name, email, role } or null
// Reads token from:
// 1. Authorization: Bearer <token>
// 2. Cookie: auth-token / token
// ------------------------------------------------
export async function getAuthUser(req: Request | NextRequest) {
  try {
    let token = '';

    const authHeader = req.headers.get('authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else {
      const cookie = req.headers.get('cookie') || '';
      const match =
        cookie.match(/(?:^|;\s*)auth-token=([^;]+)/) ||
        cookie.match(/(?:^|;\s*)token=([^;]+)/) ||
        cookie.match(/(?:^|;\s*)accessToken=([^;]+)/);
      if (match) token = decodeURIComponent(match[1]);
    }

    if (!token) return null;

    // JWT format: header.payload.signature
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64').toString('utf-8')
    );

    // If token expired, treat as not logged in
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      return null;
    }

    return {
      userId: payload.userId || payload.sub || payload.id || null,
      name: payload.name || payload.email || 'User',
      email: payload.email || null,
      role: payload.role || payload.userType || payload.user_type || null,
    };
  } catch {
    return null;
  }
}

// ------------------------------------------------
// getAdminAuthorizationStatus(authUser)
// 401 = not logged in
// 403 = logged in but NOT admin
// 200 = admin, allowed
// ------------------------------------------------
export function getAdminAuthorizationStatus(authUser: any): number {
  if (!authUser) return 401;
  const role = String(authUser?.role || '').toUpperCase();
  if (role !== 'ADMIN') return 403;
  return 200;
}