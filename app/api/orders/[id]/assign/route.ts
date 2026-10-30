import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser, requireAdminUser } from '@/lib/auth/middleware';
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
    if (!requireAdminUser(authUser)) {
      return errorResponse('FORBIDDEN', 'Admin access is required to assign orders.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const { agentId } = body;

    if (!agentId || typeof agentId !== 'string') {
      return errorResponse('INVALID_AGENT', 'A valid agentId is required for assignment.', 400);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: { agent: { include: { user: true } }, customer: { include: { user: true } } },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    const agent = await db.agent.findUnique({
      where: { id: agentId },
      include: { user: true },
    });

    if (!agent) {
      return errorResponse('AGENT_NOT_FOUND', `Agent with ID ${agentId} not found.`, 404);
    }

    if (order.agentId === agentId && order.status === 'AGENT_ASSIGNED') {
      return successResponse(order, 200, { message: 'Agent is already assigned to this order.' });
    }

    const oldStatus = order.status;
    const newStatus = 'AGENT_ASSIGNED';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot assign agent from order status ${oldStatus}.`, 400);
    }

    const updatedOrder = await db.order.update({
      where: { id },
      data: {
        agentId,
        status: newStatus,
        statusHistory: {
          create: {
            oldStatus,
            newStatus,
            changedByUserId: authUser?.userId || null,
            notes: `Assigned agent ${agent.user.name} (${agent.vehicleNumber})`,
          },
        },
        notifications: {
          create: {
            userId: order.customer.userId,
            type: 'WHATSAPP',
            recipient: order.customer.user.phone,
            content: `Agent ${agent.user.name} (${agent.vehicleNumber}) has been assigned to your Junk It Out pickup ${order.orderNumber}.`,
            status: 'SENT',
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

    await db.agent.update({
      where: { id: agentId },
      data: { status: 'ASSIGNED' },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser ? authUser.phone : 'Admin',
        action: 'AGENT_ASSIGNED',
        oldValue: order.agent ? order.agent.user.name : 'Unassigned',
        newValue: agent.user.name,
      },
    });

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('ORDER_ASSIGNED', { orderId: id, agentId, agentName: agent.user.name });

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Assign agent error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to assign agent.', 500);
  }
}
