import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const notifications = await db.notification.findMany({
      include: {
        user: { select: { name: true, phone: true } },
        order: { select: { orderNumber: true } },
      },
      orderBy: { sentAt: 'desc' },
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

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Fetch admin notifications error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
