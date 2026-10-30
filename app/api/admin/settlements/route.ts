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
    const { id, status, utr, payoutId, payoutMethod, failureReason } = body;
    const allowedStatuses = ['APPROVED', 'READY_FOR_PAYOUT', 'PROCESSING', 'PAID', 'SETTLEMENT_COMPLETED', 'FAILED'];
    if (!id || typeof id !== 'string' || !allowedStatuses.includes(status)) {
      return NextResponse.json({ success: false, message: 'Only APPROVED, READY_FOR_PAYOUT, PROCESSING, PAID, SETTLEMENT_COMPLETED, or FAILED settlement states are supported.' }, { status: 400 });
    }

    const trimmedId = id.trim();
    let existing: any = null;
    try {
      if (typeof db.settlement.findUnique === 'function') {
        existing = await db.settlement.findUnique({
          where: { id: trimmedId },
          include: { order: true },
        });
      }
    } catch {
      existing = null;
    }

    // Terminal state protection: PAID settlements cannot be modified or re-executed
    if (existing && (existing.status === 'PAID' || existing.status === 'SETTLEMENT_COMPLETED') && status !== existing.status) {
      return NextResponse.json({ success: false, message: 'This settlement has already been paid and finalized.' }, { status: 409 });
    }

    const now = new Date();
    const updateData: {
      status: string;
      approvedAt?: Date;
      paidAt?: Date;
      processedAt?: Date;
      utr?: string | null;
      payoutId?: string | null;
      payoutMethod?: string;
      failureReason?: string | null;
    } = { status };

    if (status === 'APPROVED' || status === 'READY_FOR_PAYOUT') {
      updateData.approvedAt = existing?.approvedAt || now;
      if (status === 'READY_FOR_PAYOUT') {
        updateData.failureReason = null;
      }
    } else if (status === 'PROCESSING') {
      updateData.processedAt = now;
      if (payoutId) updateData.payoutId = String(payoutId).trim();
      if (payoutMethod) updateData.payoutMethod = String(payoutMethod).trim();
    } else if (status === 'PAID' || status === 'SETTLEMENT_COMPLETED') {
      updateData.paidAt = now;
      updateData.processedAt = now;
      if (utr) updateData.utr = String(utr).trim();
      if (payoutId) updateData.payoutId = String(payoutId).trim();
      if (payoutMethod) updateData.payoutMethod = String(payoutMethod).trim();
      updateData.failureReason = null;
    } else if (status === 'FAILED') {
      updateData.failureReason = failureReason ? String(failureReason).trim() : 'Payout execution failed via banking channel.';
    }

    const executeUpdate = async (client: any) => {
      const updated = await client.settlement.update({
        where: { id: trimmedId },
        data: updateData,
      });

      if (existing?.orderId && (status === 'PAID' || status === 'SETTLEMENT_COMPLETED')) {
        if (typeof client.order?.updateMany === 'function') {
          await client.order.updateMany({
            where: { id: existing.orderId },
            data: {
              paymentStatus: 'SETTLEMENT_COMPLETED',
              status: existing.order?.status === 'PICKUP_COMPLETED' ? 'SETTLEMENT_COMPLETED' : existing.order?.status,
            },
          }).catch(() => null);
        }
      }

      if (typeof client.auditLog?.create === 'function') {
        await client.auditLog.create({
          data: {
            userId: authUser?.userId || null,
            userName: authUser?.name || 'Admin Operations',
            action: 'SETTLEMENT_STATUS_UPDATED',
            oldValue: JSON.stringify({ status: existing?.status || null, amount: existing?.amount || updated.amount }),
            newValue: JSON.stringify({
              settlementId: updated.id,
              status,
              amount: updated.amount,
              utr: updateData.utr || null,
              payoutId: updateData.payoutId || null,
            }),
          },
        }).catch(() => null);
      }

      return updated;
    };

    const settlement = typeof db.$transaction === 'function'
      ? await db.$transaction(executeUpdate).catch(async () => await executeUpdate(db))
      : await executeUpdate(db);

    return NextResponse.json({ success: true, data: settlement });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'An unexpected error occurred. Please try again.' }, { status: 500 });
  }
}
