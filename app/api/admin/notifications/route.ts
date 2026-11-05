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
    const statusParam = searchParams.get('status')?.trim();
    const typeParam = searchParams.get('type')?.trim();
    const searchParam = searchParams.get('search')?.trim().toLowerCase();

    const where: any = {};
    if (statusParam && statusParam !== 'ALL') {
      where.status = statusParam;
    }
    if (typeParam && typeParam !== 'ALL') {
      where.type = typeParam;
    }
    if (searchParam) {
      where.OR = [
        { recipient: { contains: searchParam, mode: 'insensitive' } },
        { content: { contains: searchParam, mode: 'insensitive' } },
        { order: { orderNumber: { contains: searchParam, mode: 'insensitive' } } },
        { user: { name: { contains: searchParam, mode: 'insensitive' } } },
      ];
    }

    const [total, notifications] = await Promise.all([
      db.notification.count({ where }),
      db.notification.findMany({
        where,
        include: {
          user: { select: { name: true, phone: true } },
          order: { select: { orderNumber: true } },
        },
        orderBy: { sentAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const formatted = notifications.map((n) => ({
      id: n.id,
      type: n.type,
      recipient: n.recipient || n.user?.phone || 'Customer',
      content: n.content,
      status: n.status,
      provider: n.provider || 'FAST2SMS',
      deliveryStatus: n.deliveryStatus || n.status,
      deliveryAttempts: n.deliveryAttempts || 0,
      statusDescription: n.statusDescription || null,
      orderNumber: n.order?.orderNumber || null,
      userName: n.user?.name || null,
      rawDate: n.sentAt.toISOString(),
      sentAt: new Date(n.sentAt).toLocaleString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    });
  } catch (error: any) {
    console.error('Fetch admin notifications error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { recipient, type, content, status, provider } = body;

    if (!content || typeof content !== 'string' || !content.trim()) {
      return NextResponse.json({ success: false, message: 'Alert content is required.' }, { status: 400 });
    }

    if (!recipient || typeof recipient !== 'string' || !recipient.trim()) {
      return NextResponse.json({ success: false, message: 'Recipient is required.' }, { status: 400 });
    }

    // Resolve userId: find an admin or user to link
    const targetUserId = authUser?.userId || (await db.user.findFirst({ select: { id: true } }))?.id;
    if (!targetUserId) {
      return NextResponse.json({ success: false, message: 'Unable to resolve operational user.' }, { status: 500 });
    }

    const newNotification = await db.notification.create({
      data: {
        userId: targetUserId,
        type: type && typeof type === 'string' ? type.trim() : 'SYSTEM_ALERT',
        recipient: recipient.trim(),
        content: content.trim(),
        status: status && typeof status === 'string' ? status.trim() : 'QUEUED',
        provider: provider && typeof provider === 'string' ? provider.trim() : 'INTERNAL_OPS',
        deliveryStatus: 'queued',
        deliveryAttempts: 1,
        statusDescription: 'Broadcast dispatched via Admin Portal',
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'OPERATIONAL_ALERT_BROADCAST',
        oldValue: null,
        newValue: `Alert created: [${newNotification.type}] To: ${newNotification.recipient} Content: ${newNotification.content.slice(0, 60)}...`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: 'Operational alert broadcast successfully created.',
      data: newNotification,
    });
  } catch (error: any) {
    console.error('Create admin notification error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, status, action } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Notification ID is required.' }, { status: 400 });
    }

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Notification not found.' }, { status: 404 });
    }

    let nextStatus = status;
    if (!nextStatus && action === 'ACKNOWLEDGE') {
      nextStatus = 'ACKNOWLEDGED';
    } else if (!nextStatus && action === 'RESOLVE') {
      nextStatus = 'RESOLVED';
    } else if (!nextStatus) {
      nextStatus = 'ACKNOWLEDGED';
    }

    const updated = await db.notification.update({
      where: { id },
      data: {
        status: nextStatus,
        deliveryStatus: nextStatus.toLowerCase(),
        statusDescription: `Status updated to ${nextStatus} by ${authUser?.name || 'Admin'}`,
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'ALERT_STATUS_UPDATED',
        oldValue: `Status: ${existing.status}`,
        newValue: `Status: ${updated.status} for alert ${id}`,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: `Alert status successfully updated to ${nextStatus}.`,
      data: updated,
    });
  } catch (error: any) {
    console.error('Update admin notification error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
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
    let id = searchParams.get('id');
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
    }

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Notification ID is required.' }, { status: 400 });
    }

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Notification not found.' }, { status: 404 });
    }

    await db.notification.delete({ where: { id } });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'ALERT_DELETED',
        oldValue: `Deleted alert [${existing.type}] To: ${existing.recipient}`,
        newValue: null,
      },
    }).catch(() => null);

    return NextResponse.json({
      success: true,
      message: 'Alert record successfully deleted.',
    });
  } catch (error: any) {
    console.error('Delete admin notification error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
