import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { NextRequest } from 'next/server';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  const authorizationStatus = getAdminAuthorizationStatus(authUser);
  if (authorizationStatus === 401) {
    return NextResponse.json(
      { success: false, message: 'Authentication is required.' },
      { status: 401 },
    );
  }
  if (authorizationStatus === 403) {
    return NextResponse.json(
      { success: false, message: 'Admin access required.' },
      { status: 403 },
    );
  }

  try {
    const auditLogs = await db.auditLog.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
    return NextResponse.json({ success: true, data: auditLogs });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Failed to fetch audit logs.' },
      { status: 500 },
    );
  }
}
