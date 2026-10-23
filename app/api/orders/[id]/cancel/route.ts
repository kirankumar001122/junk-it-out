import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  CANCELLABLE_ORDER_STATUSES,
  canCancelOrder,
} from '@/lib/orders/cancellation';
import { broadcaster } from '@/lib/realtime';
import { createRefundRequestForCapturedPayment } from '@/lib/payments/refundRequests';

class CancellationConflictError extends Error {}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser) {
      return NextResponse.json(
        { success: false, message: 'Authentication is required.' },
        { status: 401 },
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const cancellationReason =
      typeof body.cancellationReason === 'string'
        ? body.cancellationReason.trim().slice(0, 500)
        : '';

    const order = await db.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        agentId: true,
        status: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found.' },
        { status: 404 },
      );
    }

    const isAuthorized = canCancelOrder(
      {
        userId: authUser.userId,
        role: authUser.role,
        customerId: authUser.customerId,
        agentId: authUser.agentId,
      },
      order,
    );

    if (!isAuthorized) {
      // Do not disclose another customer's order to customer/agent callers.
      const status =
        authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN'
          ? 403
          : 404;
      return NextResponse.json(
        { success: false, message: status === 404 ? 'Order not found.' : 'You are not allowed to cancel this order.' },
        { status },
      );
    }

    const reason = cancellationReason || 'Order cancellation requested.';
    const cancelledOrder = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id,
          status: { in: [...CANCELLABLE_ORDER_STATUSES] },
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
        },
      });

      if (claimed.count !== 1) {
        throw new CancellationConflictError(
          'The order is no longer eligible for cancellation.',
        );
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedByUserId: authUser.userId,
          notes: `Cancelled by ${authUser.role.toLowerCase()}. Reason: ${reason}`,
        },
      });

      if (order.agentId) {
        const activeAssignmentCount = await tx.order.count({
          where: {
            agentId: order.agentId,
            status: {
              in: [
                'AGENT_ASSIGNED',
                'AGENT_ACCEPTED',
                'AGENT_ON_WAY',
                'AGENT_ARRIVED',
                'WASTE_VERIFICATION',
                'WEIGHING',
              ],
            },
          },
        });
        if (activeAssignmentCount === 0) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      await createRefundRequestForCapturedPayment(
        tx,
        id,
        authUser.userId,
      );

      await tx.auditLog.create({
        data: {
          userId: authUser.userId,
          userName: authUser.name || authUser.phone,
          action: 'ORDER_CANCELLED',
          oldValue: `Order ${order.orderNumber} (${order.status})`,
          newValue: `CANCELLED: ${reason}`,
        },
      });

      return tx.order.findUnique({
        where: { id },
        include: { customer: { include: { user: true } } },
      });
    });

    // Cancellation intentionally does not refund payments. The existing
    // financial policy exposes refunds as a separate admin operation.
    broadcaster.broadcast('ORDER_UPDATED', cancelledOrder);

    return NextResponse.json({
      success: true,
      message: 'Order cancelled successfully.',
      data: cancelledOrder,
    });
  } catch (error) {
    if (error instanceof CancellationConflictError) {
      return NextResponse.json(
        { success: false, message: error.message },
        { status: 409 },
      );
    }

    console.error('Order cancellation error:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to cancel order.' },
      { status: 500 },
    );
  }
}
