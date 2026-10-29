import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    const notifications = await db.notification.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { sentAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const formatted = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      recipient: n.recipient || n.user?.phone || 'Customer',
      content: n.content,
      status: n.status,
      sentAt: new Date(n.sentAt).toLocaleString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin notifications error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
