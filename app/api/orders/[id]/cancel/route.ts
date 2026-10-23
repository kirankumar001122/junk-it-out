import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, isAdminRole } from '@/lib/auth/middleware';
import { isCustomerOrderOwner } from '@/lib/orderAccess';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { errorResponse } from '@/lib/utils/apiResponse';
import { refundAttemptId, refundEventId } from '@/lib/payments/refundWorkflow';

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
      return errorResponse('UNAUTHORIZED', 'Authentication is required to cancel an order.', 401);
    }

    const isAdmin = isAdminRole(authUser);
    if (authUser.role !== 'CUSTOMER' && !isAdmin) {
      return errorResponse('FORBIDDEN', 'You are not authorized to cancel orders.', 403);
    }

    const { id } = await params;
    const order = await db.order.findUnique({
      where: { id },
      include: { customer: { include: { user: true } } },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', 'Order not found.', 404);
    }

    if (authUser.role === 'CUSTOMER' && !isCustomerOrderOwner(order, authUser)) {
      return errorResponse('FORBIDDEN', 'You are not authorized to cancel this order.', 403);
    }

    if (
      order.status === 'CANCELLED' ||
      !validateStatusTransition(order.status, 'CANCELLED') ||
      (authUser.role === 'CUSTOMER' && !CUSTOMER_CANCELLABLE_STATUSES.has(order.status))
    ) {
      return errorResponse(
        'INVALID_ORDER_STATE',
        'This order can no longer be cancelled.',
        409,
      );
    }

    const body = await req.json().catch(() => ({}));
    const cancellationReason =
      typeof body?.cancellationReason === 'string' && body.cancellationReason.trim()
        ? body.cancellationReason.trim().slice(0, 500)
        : 'Customer requested cancellation';

    const result = await db.$transaction(async (tx) => {
      const isPaid = order.paymentStatus === 'CAPTURED';
      const orderUpdateData: Record<string, unknown> = {
        status: 'CANCELLED',
        cancellationReason,
      };
      if (isPaid) {
        orderUpdateData.paymentStatus = 'REFUND_PENDING';
      }

      // A conditional write makes the state check concurrency-safe. If another
      // request changes the order first, no history or audit rows are written.
      const changed = await tx.order.updateMany({
        where: { id: order.id, status: order.status, agentId: order.agentId },
        data: orderUpdateData,
      });

      if (changed.count !== 1) return null;

      if (isPaid && tx.payment) {
        const payment = await tx.payment.findFirst({
          where: { orderId: order.id, direction: 'CUSTOMER_PAYS', status: 'CAPTURED' },
        });

        if (payment) {
          await tx.payment.updateMany({
            where: { id: payment.id, status: 'CAPTURED' },
            data: { status: 'REFUND_PENDING' },
          });

          if (tx.refundAttempt) {
            const attemptId = refundAttemptId(payment.id);
            await tx.refundAttempt.upsert({
              where: { id: attemptId },
              create: {
                id: attemptId,
                orderId: order.id,
                paymentId: payment.id,
                amount: payment.amount,
                status: 'RECONCILIATION_REQUIRED',
                failureReason: `Order cancelled by customer: ${cancellationReason}`,
              },
              update: {
                status: 'RECONCILIATION_REQUIRED',
                failureReason: `Order cancelled by customer: ${cancellationReason}`,
              },
            });

            if (tx.refundAttemptEvent) {
              await tx.refundAttemptEvent.create({
                data: {
                  id: refundEventId(attemptId, `order_cancelled_${Date.now()}`),
                  refundAttemptId: attemptId,
                  eventType: 'ORDER_CANCELLED',
                  status: 'REFUND_PENDING',
                  details: {
                    source: 'customer_order_cancellation',
                    cancellationReason,
                    paymentId: payment.id,
                    amount: payment.amount,
                  },
                },
              });
            }
          }
        }
      }

      const historyNotes = isPaid
        ? `Cancelled. Reason: ${cancellationReason}. Captured payment pending admin refund review.`
        : `Cancelled. Reason: ${cancellationReason}`;

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedByUserId: authUser.userId,
          notes: historyNotes,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: authUser.userId,
          action: 'ORDER_CANCELLED',
          oldValue: `Order ${order.orderNumber} (${order.status})`,
          newValue: isPaid
            ? `CANCELLED: ${cancellationReason} [Captured payment pending refund review]`
            : `CANCELLED: ${cancellationReason}`,
        },
      });

      if (order.agentId) {
        const otherActiveOrder = await tx.order.findFirst({
          where: {
            agentId: order.agentId,
            id: { not: order.id },
            status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
          },
          select: { id: true },
        });
        if (!otherActiveOrder) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      return tx.order.findUnique({
        where: { id: order.id },
        include: { customer: { include: { user: true } } },
      });
    });

    if (!result) {
      return errorResponse('ORDER_STATE_CONFLICT', 'The order state changed; refresh and try again.', 409);
    }

    broadcaster.broadcast('ORDER_UPDATED', result);

    const hasCapturedPayment = order.paymentStatus === 'CAPTURED';

    return NextResponse.json({
      success: true,
      message: hasCapturedPayment
        ? 'Order cancelled successfully. Captured payment is flagged for admin refund review.'
        : 'Order cancelled successfully',
      data: result,
      refundReviewRequired: hasCapturedPayment,
    });
  } catch (error) {
    console.error('Cancel order error:');
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to cancel order.', 500);
  }
}
