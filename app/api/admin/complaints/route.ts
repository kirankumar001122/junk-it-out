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

    const complaints = await db.complaint.findMany({
      include: {
        order: { select: { orderNumber: true } },
        customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });

    const formatted = complaints.map((c) => ({
      id: c.id,
      orderId: c.orderId,
      orderNumber: c.order?.orderNumber || 'General Support',
      customerName: c.customer?.user?.name || 'Customer',
      customerPhone: c.customer?.user?.phone || '—',
      category: c.category,
      description: c.description,
      message: c.description,
      status: c.status,
      photoUrl: c.photoUrl,
      resolutionNotes: c.resolutionNotes || null,
      createdAt: new Date(c.createdAt).toLocaleString('en-IN', {
        month: 'short',
        day: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }),
    }));

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin complaints error:', error);
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
    const { id, status, resolutionNotes } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Missing or invalid complaint ID.' }, { status: 400 });
    }

    const allowedStatuses = ['PENDING', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED'];
    if (!status || !allowedStatuses.includes(status)) {
      return NextResponse.json({
        success: false,
        message: `Status must be one of: ${allowedStatuses.join(', ')}`,
      }, { status: 400 });
    }

    const existing = await db.complaint.findUnique({ where: { id: id.trim() } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Complaint record not found.' }, { status: 404 });
    }

    const sanitizedNotes = typeof resolutionNotes === 'string' && resolutionNotes.trim()
      ? resolutionNotes.trim().slice(0, 1000)
      : null;

    const updated = await db.complaint.update({
      where: { id: id.trim() },
      data: {
        status,
        ...(sanitizedNotes !== null ? { resolutionNotes: sanitizedNotes } : {}),
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'COMPLAINT_UPDATED',
        oldValue: `Status: ${existing.status}`,
        newValue: `Status: ${status}${sanitizedNotes ? ` | Notes: ${sanitizedNotes}` : ''}`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update complaint error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
