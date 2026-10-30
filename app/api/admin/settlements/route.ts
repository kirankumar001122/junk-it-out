import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  const authUser = await getAuthUser(req);
  const authorizationStatus = getAdminAuthorizationStatus(authUser);
  if (authorizationStatus === 401) {
    return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
  }
  if (authorizationStatus === 403) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Math.max(1, Number(searchParams.get('limit')) || 100), 200);

    const settlements = await db.settlement.findMany({
      include: {
        order: { include: { items: { include: { category: true } } } },
        customer: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                phone: true,
                email: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return NextResponse.json({ success: true, data: settlements });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const authUser = await getAuthUser(req);
  const authorizationStatus = getAdminAuthorizationStatus(authUser);
  if (authorizationStatus === 401) {
    return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
  }
  if (authorizationStatus === 403) {
    return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { id, status } = body;
    const allowedStatuses = ['APPROVED', 'READY_FOR_PAYOUT', 'PAID', 'SETTLEMENT_COMPLETED'];
    if (!id || typeof id !== 'string' || !allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, message: 'Only APPROVED, READY_FOR_PAYOUT, or PAID settlement states are supported.' }, { status: 400 });
    }

    const transactionReference = (
      body.transactionReference ||
      body.payoutId ||
      body.reference ||
      ''
    ).toString().trim();

    if (status === 'PAID' || status === 'SETTLEMENT_COMPLETED') {
      if (!transactionReference || !/^[A-Za-z0-9_-]{4,64}$/.test(transactionReference)) {
        return NextResponse.json({
          success: false,
          message: 'A valid transaction reference or payout ID (4-64 alphanumeric characters, underscores or hyphens) is required to mark settlement as paid.',
        }, { status: 400 });
      }
    }

    const now = new Date();
    const updateData: { status: string; approvedAt?: Date; paidAt?: Date } = { status };
    if (status === 'APPROVED' || status === 'READY_FOR_PAYOUT') {
      updateData.approvedAt = now;
    } else if (status === 'PAID' || status === 'SETTLEMENT_COMPLETED') {
      updateData.paidAt = now;
    }

    const settlement = await db.settlement.update({
      where: { id: id.trim() },
      data: updateData,
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'SETTLEMENT_STATUS_UPDATED',
        oldValue: null,
        newValue: `Settlement ${settlement.id} updated to status ${status} (Amount: ₹${settlement.amount}${transactionReference ? `, Ref: ${transactionReference}` : ''})`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, data: settlement });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
