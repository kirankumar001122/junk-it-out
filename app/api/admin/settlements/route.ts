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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!requireAdminUser(authUser)) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const { id, status } = await req.json();
    if (!id || !['APPROVED', 'READY_FOR_PAYOUT'].includes(status)) {
      return NextResponse.json({ success: false, message: 'Only APPROVED or READY_FOR_PAYOUT settlement states are supported.' }, { status: 400 });
    }

    const settlement = await db.settlement.update({
      where: { id },
      data: { status, approvedAt: status === 'APPROVED' || status === 'READY_FOR_PAYOUT' ? new Date() : undefined },
    });
    return NextResponse.json({ success: true, data: settlement });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
