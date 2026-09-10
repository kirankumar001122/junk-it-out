import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
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
    if (!authUser) {
      return NextResponse.json({ success: false, message: 'Authentication required.' }, { status: 401 });
    }

    if (authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json({ success: false, message: 'Only customers can submit complaints.' }, { status: 403 });
    }

    const { orderId, category, description, photoUrl } = await req.json().catch(() => ({}));
    if (!orderId || !description) {
      return NextResponse.json({ success: false, message: 'orderId and description are required.' }, { status: 400 });
    }

    const order = await db.order.findUnique({ where: { id: orderId } });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found.' }, { status: 404 });
    }

    if (order.customerId !== authUser.customerId) {
      return NextResponse.json({ success: false, message: 'You are not authorized to report an issue for this order.' }, { status: 403 });
    }

    const complaint = await db.complaint.create({
      data: {
        orderId: order.id,
        customerId: authUser.customerId,
        category: category || 'WEIGHT_DISPUTE',
        description,
        photoUrl: photoUrl || null,
        status: 'OPEN',
      },
    });

    return NextResponse.json({ success: true, data: complaint });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
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
