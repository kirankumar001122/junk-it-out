import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    try {
      await db.$executeRawUnsafe(`ALTER TABLE "Complaint" ALTER COLUMN "orderId" DROP NOT NULL;`);
    } catch (_e) {
      // Schema synchronized
    }

    const complaints = await db.complaint.findMany({
      include: {
        order: { select: { orderNumber: true } },
        customer: { include: { user: { select: { name: true, phone: true, email: true } } } },
      },
      orderBy: { createdAt: 'desc' },
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

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Fetch admin complaints error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    const { id, status, resolutionNotes } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing complaint ID or status.' }, { status: 400 });
    }

    const updated = await db.complaint.update({
      where: { id },
      data: {
        status,
        ...(resolutionNotes ? { resolutionNotes } : {}),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update complaint error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
