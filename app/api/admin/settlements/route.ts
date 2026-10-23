import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!requireAdminUser(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const settlements = await db.settlement.findMany({
      include: {
        order: { include: { items: { include: { category: true } } } },
        customer: { include: { user: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ success: true, data: settlements });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!requireAdminUser(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const { id, status } = await req.json();
    const allowedStatuses = ['APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'SETTLEMENT_COMPLETED'];
    if (!id || !allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, message: 'Only APPROVED, READY_FOR_PAYOUT, or PAID settlement states are supported.' }, { status: 400 });
    }

    const now = new Date();
    const updateData: { status: string; approvedAt?: Date; paidAt?: Date } = { status };
    if (status === 'APPROVED' || status === 'READY_FOR_PAYOUT') {
      updateData.approvedAt = now;
    } else if (status === 'PAID' || status === 'SETTLEMENT_COMPLETED') {
      updateData.paidAt = now;
    }

    const settlement = await db.settlement.update({
      where: { id },
      data: updateData,
    });
    return NextResponse.json({ success: true, data: settlement });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
