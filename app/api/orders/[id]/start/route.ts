import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'AGENT') {
      return errorResponse('UNAUTHORIZED', 'Authenticated agent access is required.', 401);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { agent: { include: { user: true } }, customer: { include: { user: true } } },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (!order.agentId || order.agentId !== authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    const oldStatus = order.status;
    const newStatus = 'AGENT_ON_WAY';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot transition order status from ${oldStatus} to ${newStatus}.`, 400);
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        status: newStatus,
        statusHistory: {
          create: {
            oldStatus,
            newStatus,
            changedByUserId: authUser?.userId || null,
            notes: `Agent started journey to customer location.`,
          },
        },
      },
      include: {
        agent: { include: { user: true } },
        customer: { include: { user: true } },
        address: true,
        items: { include: { category: true } },
      },
    });

    if (order.agentId) {
      await db.agent.update({
        where: { id: order.agentId },
        data: { status: 'EN_ROUTE' },
      });
    }

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('AGENT_STARTED', { orderId: id, agentId: order.agentId });

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Start journey error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to start journey.', 500);
  }
}
