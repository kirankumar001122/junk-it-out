import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { isVerifiedCustomerPrincipal } from '@/lib/auth/accessPolicy';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }
    if (!['CUSTOMER', 'AGENT', 'ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Access denied.' }, { status: 403 });
    }

    let whereClause: any = {};
    if (authUser.role === 'CUSTOMER') {
      whereClause = { customerId: authUser.customerId || 'unmatched' };
    } else if (authUser.role === 'AGENT') {
      whereClause = { order: { agentId: authUser.agentId || 'unmatched' } };
    }

    const complaints = await db.complaint.findMany({
      where: whereClause,
      include: {
        customer: { include: { user: true } },
        order: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: complaints });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => ({}));
    const { orderId, category, subject, description, message, photoUrl } = body;

    const ticketMessage = (description || message || '').trim();
    if (!ticketMessage) {
      return NextResponse.json({ success: false, message: 'Message description is required.' }, { status: 400 });
    }

    const customerId = isVerifiedCustomerPrincipal(authUser?.role, authUser?.customerId) ? authUser.customerId : null;
    if (!customerId) {
      return NextResponse.json(
        { success: false, message: 'A verified customer session is required to submit a support message.' },
        { status: 401 }
      );
    }

    let targetOrderId: string | null = null;
    if (orderId) {
      const order = await db.order.findUnique({ where: { id: orderId } });
      if (!order) {
        return NextResponse.json({ success: false, message: 'Order not found.' }, { status: 404 });
      }

      if (order.customerId !== customerId && authUser?.role !== 'ADMIN' && authUser?.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ success: false, message: 'You are not authorized to report an issue for this order.' }, { status: 403 });
      }
      targetOrderId = order.id;
    }

    const complaint = await db.complaint.create({
      data: {
        orderId: targetOrderId,
        customerId: customerId,
        category: category || subject || 'General Inquiry',
        description: ticketMessage,
        photoUrl: photoUrl || null,
        status: 'OPEN',
      },
    });

    return NextResponse.json({ success: true, data: complaint });
  } catch (error: any) {
    console.error('Submit complaint error:', error);
    return NextResponse.json({ success: false, message: error.message || 'Failed to submit complaint.' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { id, status, resolutionNotes } = await req.json().catch(() => ({}));

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing complaint ID or status.' }, { status: 400 });
    }

    const updated = await db.complaint.update({
      where: { id },
      data: {
        status,
        resolutionNotes,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
