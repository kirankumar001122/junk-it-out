import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { CANCELLABLE_ORDER_STATUSES } from '@/lib/orders/cancellation';
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
      select: {
        id: true,
        orderNumber: true,
        customerId: true,
        agentId: true,
        status: true,
        paymentStatus: true,
      },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found.' },
        { status: 404 },
      );
    }

    const isAdmin =
      authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN';
    const isAuthorized =
      isAdmin ||
      (authUser.role === 'CUSTOMER' &&
        authUser.customerId === order.customerId) ||
      (authUser.role === 'AGENT' &&
        Boolean(authUser.agentId && authUser.agentId === order.agentId));

    if (!isAuthorized) {
      const status =
        authUser.role === 'ADMIN' || authUser.role === 'SUPER_ADMIN'
          ? 403
          : 404;
      return NextResponse.json(
        {
          success: false,
          message: status === 404
            ? 'Order not found.'
            : 'You are not allowed to cancel this order.',
        },
        { status },
      );
    }

    const statusCanBeCancelled =
      CANCELLABLE_ORDER_STATUSES.includes(
        order.status as (typeof CANCELLABLE_ORDER_STATUSES)[number],
      ) && validateStatusTransition(order.status, 'CANCELLED');
    if (!statusCanBeCancelled) {
      if (!isAdmin) {
        return NextResponse.json(
          { success: false, message: 'Order not found.' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { success: false, message: 'The order is no longer eligible for cancellation.' },
        { status: 409 },
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

    const isPaid = order.paymentStatus === 'CAPTURED';
    const cancelledOrder = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id: order.id,
          status: order.status,
          agentId: order.agentId,
        },
        data: {
          status: 'CANCELLED',
          cancellationReason: reason,
          ...(isPaid ? { paymentStatus: 'REFUND_PENDING' } : {}),
        },
      });

      if (claimed.count !== 1) {
        throw new CancellationConflictError(
          'The order is no longer eligible for cancellation.',
        );
      }

      if (isPaid) {
        const refundRequestModel = (
          tx as unknown as {
            refundRequest?: typeof tx.refundRequest;
          }
        ).refundRequest;
        if (refundRequestModel) {
          await createRefundRequestForCapturedPayment(
            tx,
            order.id,
            authUser.userId,
          );
        }

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

          const refundAttemptModel = (
            tx as unknown as {
              refundAttempt?: typeof tx.refundAttempt;
            }
          ).refundAttempt;
          if (refundAttemptModel) {
            const attemptId = refundAttemptId(payment.id);
            await refundAttemptModel.upsert({
              where: { id: attemptId },
              create: {
                id: attemptId,
                orderId: order.id,
                paymentId: payment.id,
                amount: payment.amount,
                status: 'RECONCILIATION_REQUIRED',
                failureReason: `Order cancelled by ${authUser.role.toLowerCase()}: ${reason}`,
              },
              update: {
                status: 'RECONCILIATION_REQUIRED',
                failureReason: `Order cancelled by ${authUser.role.toLowerCase()}: ${reason}`,
              },
            });

            const refundAttemptEventModel = (
              tx as unknown as {
                refundAttemptEvent?: typeof tx.refundAttemptEvent;
              }
            ).refundAttemptEvent;
            if (refundAttemptEventModel) {
              await refundAttemptEventModel.create({
                data: {
                  id: refundEventId(
                    attemptId,
                    `order_cancelled_${Date.now()}`,
                  ),
                  refundAttemptId: attemptId,
                  eventType: 'ORDER_CANCELLED',
                  status: 'REFUND_PENDING',
                  details: {
                    source: 'order_cancellation',
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

      await tx.orderStatusHistory.create({
        data: {
          orderId: order.id,
          oldStatus: order.status,
          newStatus: 'CANCELLED',
          changedByUserId: authUser.userId,
          notes: isPaid
            ? `Cancelled by ${authUser.role.toLowerCase()}. Reason: ${reason}. Captured payment pending refund review.`
            : `Cancelled by ${authUser.role.toLowerCase()}. Reason: ${reason}`,
        },
      });

      if (order.agentId) {
        const activeAssignmentCount = await tx.order.count({
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
        });
        if (activeAssignmentCount === 0) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: 'AVAILABLE' },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          userId: authUser.userId,
          userName: authUser.name || authUser.phone,
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
        { success: false, message: 'The order state changed; refresh and try again.' },
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
