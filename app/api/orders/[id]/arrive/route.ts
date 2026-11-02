import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { SAFE_HYDRATED_ORDER_INCLUDE, formatOrderResponse } from '@/lib/orders/orderFormat';
import { runBackgroundTask } from '@/lib/utils/backgroundTask';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const logTiming = (phase: string) =>
    console.info(`[api/orders/arrive] ${phase} elapsedMs=${Date.now() - startedAt}`);
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    logTiming('authentication complete');
    if (!authUser || authUser.role !== 'AGENT') {
      return errorResponse('UNAUTHORIZED', 'Authenticated agent access is required.', 401);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: SAFE_HYDRATED_ORDER_INCLUDE,
    });
    logTiming('order lookup complete');

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (!order.agentId || order.agentId !== authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    const oldStatus = order.status;
    const newStatus = 'AGENT_ARRIVED';

    // Idempotent retry: order is already in AGENT_ARRIVED for this agent
    if (oldStatus === newStatus) {
      return successResponse(
        formatOrderResponse(order, {
          id: order.id,
          orderNumber: order.orderNumber,
          agentId: order.agentId,
          status: newStatus,
        })
      );
    }

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot transition order status from ${oldStatus} to ${newStatus}.`, 400);
    }

    const transition = await db.$transaction(async (tx) => {
      const result = await tx.order.updateMany({
        where: { id, agentId: authUser.agentId, status: oldStatus },
        data: { status: newStatus },
      });

      if (result.count !== 1) {
        return {
          kind: 'conflict' as const,
          order: await tx.order.findUnique({
            where: { id },
            include: SAFE_HYDRATED_ORDER_INCLUDE,
          }),
        };
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus,
          newStatus,
          changedByUserId: authUser.userId || null,
          notes: 'Agent arrived at customer doorstep.',
        },
      });

      await tx.agent.update({
        where: { id: authUser.agentId },
        data: { status: 'ARRIVED' },
      });

      return {
        kind: 'updated' as const,
        order: await tx.order.findUnique({
          where: { id },
          include: SAFE_HYDRATED_ORDER_INCLUDE,
        }),
      };
    }, { isolationLevel: 'ReadCommitted', maxWait: 5000, timeout: 5000 });

    if (transition.kind === 'conflict') {
      if (transition.order?.agentId === authUser.agentId && transition.order.status === newStatus) {
        return successResponse(
          formatOrderResponse(transition.order, {
            id: order.id,
            orderNumber: order.orderNumber,
            agentId: order.agentId,
            status: newStatus,
          })
        );
      }
      return errorResponse('ORDER_STATE_CHANGED', 'The order changed while recording arrival. Refresh and try again.', 409);
    }

    const updatedOrder = transition.order;
    if (!updatedOrder) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }
    logTiming('order update complete');

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('AGENT_ARRIVED', { orderId: id, agentId: order.agentId });

    // Non-blocking doorstep arrival notification offloaded from HTTP response lifecycle
    runBackgroundTask(async () => {
      try {
        const customerUserId = updatedOrder.customer?.userId || (order as any).customer?.userId;
        const customerPhone = updatedOrder.customer?.user?.phone || (order as any).customer?.user?.phone;
        if (!customerUserId || !customerPhone) return;

        await db.notification.create({
          data: {
            userId: customerUserId,
            orderId: id,
            type: 'WHATSAPP',
            recipient: customerPhone,
            content: `Your Junk It Out pickup agent has arrived at your doorstep for order #${order.orderNumber}.`,
            status: 'SENT',
          },
        });
      } catch (notifErr: any) {
        console.warn('[ARRIVE NOTIFICATION NOTICE] Safe notification error:', notifErr?.message);
      }
    }, 'OrderArrivalNotification');

    logTiming('response ready');

    return successResponse(
      formatOrderResponse(updatedOrder, {
        id: order.id,
        orderNumber: order.orderNumber,
        agentId: order.agentId,
        status: newStatus,
      })
    );
  } catch (err: any) {
    console.error('Arrive error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to mark arrival.', 500);
  }
}
