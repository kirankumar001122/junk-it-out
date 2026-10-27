import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { transitionOrder } from '@/lib/services/orderLifecycle';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

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
      include: { agent: { include: { user: true } }, customer: { include: { user: true } } },
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

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot transition order status from ${oldStatus} to ${newStatus}.`, 400);
    }

    if (order.status === newStatus && order.agentId === authUser.agentId) {
      return successResponse(order);
    }

    const transition = await transitionOrder<any>({
      orderId: id,
      expectedStatus: oldStatus,
      expectedAgentId: authUser.agentId,
      newStatus,
      changedByUserId: authUser?.userId || null,
      notes: `Agent arrived at customer doorstep.`,
      include: {
        agent: { include: { user: true } },
        customer: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
      },
      afterHistory: async (tx) => {
        if (order.agentId) {
          await tx.agent.update({
            where: { id: order.agentId },
            data: { status: 'ARRIVED' },
          });
        }
      },
    });

    if (!transition.changed || !transition.order) {
      const recheck = await db.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: true } },
          customer: { include: { user: true } },
          address: true,
          items: { include: { category: true } },
        },
      });
      if (recheck?.status === newStatus && recheck?.agentId === authUser.agentId) {
        return successResponse(recheck);
      }
      return errorResponse(
        'CONFLICT',
        'Order state has changed or was cancelled before arrival.',
        409
      );
    }

    const updatedOrder = transition.order;
    logTiming('order update complete');

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('AGENT_ARRIVED', { orderId: id, agentId: order.agentId });
    logTiming('response ready');

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Arrive error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to mark arrival.', 500);
  }
}
