import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  CANCELLABLE_ORDER_STATUSES,
  canCancelOrder,
} from '@/lib/orders/cancellation';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { refundAttemptId, refundEventId } from '@/lib/payments/refundWorkflow';
import { createRefundRequestForCapturedPayment } from '@/lib/payments/refundRequests';

class CancellationConflictError extends Error {}

const CUSTOMER_CANCELLABLE_STATUSES = new Set([
  'BOOKING_RECEIVED',
  'AGENT_BEING_ASSIGNED',
  'AGENT_ASSIGNED',
  'AGENT_ACCEPTED',
  'AGENT_ON_WAY',
]);

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser?.userId) {
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
    const reason = cancellationReason || 'Order cancellation requested.';

    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } } },
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
        role: authUser.role as any,
        customerId: authUser.customerId,
        agentId: authUser.agentId,
      },
      order,
    );

    if (
      (authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN') &&
      (order.status === 'CANCELLED' || !validateStatusTransition(order.status, 'CANCELLED'))
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'The order is no longer eligible for cancellation.',
        },
        { status: 409 },
      );
    }

    if (!isAuthorized) {
      // Do not disclose another customer's order to customer/agent callers.
      const status =
        authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN'
          ? 403
          : 404;
      return NextResponse.json(
        {
          success: false,
          message:
            status === 404
              ? 'Order not found.'
              : 'You are not allowed to cancel this order.',
        },
        { status },
      );
    }

    if (
      authUser.role === 'CUSTOMER' &&
      !CUSTOMER_CANCELLABLE_STATUSES.has(order.status)
    ) {
      return NextResponse.json(
        { success: false, message: 'This order can no longer be cancelled.' },
        { status: 409 },
      );
    }

    if (
      order.status === 'CANCELLED' ||
      !validateStatusTransition(order.status, 'CANCELLED')
    ) {
      return NextResponse.json(
        {
          success: false,
          message: 'The order is no longer eligible for cancellation.',
        },
        { status: 409 },
      );
    }

    const isPaid = order.paymentStatus === 'CAPTURED';

    const cancelledOrder = await db.$transaction(async (tx) => {
      const orderUpdateData: Record<string, unknown> = {
        status: 'CANCELLED',
        cancellationReason: reason,
      };
      if (isPaid) {
        orderUpdateData.paymentStatus = 'REFUND_PENDING';
      }

      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
          ...(order.agentId !== undefined ? { agentId: order.agentId } : {}),
        },
        data: orderUpdateData,
      });

      if (claimed.count !== 1) {
        throw new CancellationConflictError(
          'The order is no longer eligible for cancellation.',
        );
      }

      if (isPaid) {
        if ((tx as any).refundRequest) {
          try {
            await createRefundRequestForCapturedPayment(
              tx,
              id,
              authUser.userId,
            );
          } catch (refundReqErr) {
            console.warn(
              '[CANCEL] createRefundRequestForCapturedPayment skipped:',
              refundReqErr,
            );
          }
        }

        if (tx.payment) {
          const payment = await tx.payment.findFirst({
            where: {
              orderId: order.id,
              direction: 'CUSTOMER_PAYS',
              status: 'CAPTURED',
            },
          });

          if (payment) {
            await tx.payment.updateMany({
              where: { id: payment.id, status: 'CAPTURED' },
              data: { status: 'REFUND_PENDING' },
            });

            if ((tx as any).refundAttempt) {
              const attemptId = refundAttemptId(payment.id);
              await (tx as any).refundAttempt.upsert({
                where: { id: attemptId },
                create: {
                  id: attemptId,
                  orderId: order.id,
                  paymentId: payment.id,
                  amount: payment.amount,
                  status: 'RECONCILIATION_REQUIRED',
                  failureReason: `Order cancelled by customer: ${reason}`,
                },
                update: {
                  status: 'RECONCILIATION_REQUIRED',
                  failureReason: `Order cancelled by customer: ${reason}`,
                },
              });

              if ((tx as any).refundAttemptEvent) {
                await (tx as any).refundAttemptEvent.create({
                  data: {
                    id: refundEventId(
                      attemptId,
                      `order_cancelled_${Date.now()}`,
                    ),
                    refundAttemptId: attemptId,
                    eventType: 'ORDER_CANCELLED',
                    status: 'REFUND_PENDING',
                    details: {
                      source: 'customer_order_cancellation',
                      cancellationReason: reason,
                      paymentId: payment.id,
                      amount: payment.amount,
                    },
                  },
                });
              }
            }
          }
        }
      }

      const historyNotes = isPaid
        ? `Cancelled by ${authUser.role.toLowerCase()}. Reason: ${reason}. Captured payment pending refund review.`
        : `Cancelled by ${authUser.role.toLowerCase()}. Reason: ${reason}`;

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedByUserId: authUser.userId,
          notes: historyNotes,
        },
      });

      if (order.agentId) {
        const otherActiveOrder = tx.order.findFirst
          ? await tx.order.findFirst({
              where: {
                agentId: order.agentId,
                id: { not: order.id },
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
              select: { id: true },
            })
          : null;
        if (!otherActiveOrder) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: authUser.userId,
          userName:
            (authUser as any).name || (authUser as any).phone || undefined,
          action: 'ORDER_CANCELLED',
          oldValue: `Order ${order.orderNumber} (${order.status})`,
          newValue: isPaid
            ? `CANCELLED: ${reason} [Captured payment pending refund review]`
            : `CANCELLED: ${reason}`,
        },
      });

      return tx.order.findUnique({
        where: { id: order.id },
        include: { customer: { include: { user: true } } },
      });
    });

    if (!cancelledOrder) {
      return NextResponse.json(
        {
          success: false,
          message: 'The order state changed; refresh and try again.',
        },
        { status: 409 },
      );
    }

    broadcaster.broadcast('ORDER_UPDATED', cancelledOrder);

    return NextResponse.json({
      success: true,
      message: isPaid
        ? 'Order cancelled successfully. Captured payment is flagged for admin refund review.'
        : 'Order cancelled successfully.',
      data: cancelledOrder,
      refundReviewRequired: isPaid,
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
