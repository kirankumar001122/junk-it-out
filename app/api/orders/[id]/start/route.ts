import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { transitionOrder } from '@/lib/services/orderLifecycle';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { sendDispatchUpdate } from '@/lib/services/whatsappService';
import { runBackgroundTask } from '@/lib/utils/backgroundTask';

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

    if (order.status === newStatus && order.agentId === authUser.agentId) {
      return successResponse(order);
    }

    const transition = await transitionOrder<any>({
      orderId: id,
      expectedStatus: oldStatus,
      expectedAgentId: authUser.agentId,
      newStatus,
      changedByUserId: authUser?.userId || null,
      notes: `Agent started journey to customer location.`,
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
            data: { status: 'EN_ROUTE' },
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
        'Order state has changed or was cancelled before journey start.',
        409
      );
    }

    const updatedOrder = transition.order;

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('AGENT_STARTED', { orderId: id, agentId: order.agentId });

    // Notifications are nonessential to the journey transition and may involve
    // a slow third-party request. Keep them out of the action response path.
    runBackgroundTask(async () => {
      try {
        const customerPhone = updatedOrder.customer?.user?.phone;
        const customerName = updatedOrder.customer?.user?.name || 'Valued Customer';
        const agentName = updatedOrder.agent?.user?.name || 'Field Agent';
        const agentPhone = updatedOrder.agent?.user?.phone || '';

        if (!customerPhone) return;

        const existingNotification = await db.notification.findFirst({
          where: {
            orderId: updatedOrder.id,
            type: 'WHATSAPP_DISPATCH_UPDATE',
          },
          select: { id: true },
        });

        if (existingNotification) return;

        const whatsappResult = await sendDispatchUpdate({
          customerPhone,
          customerName,
          agentName,
          agentPhone,
          estimatedArrival: '20-30 mins',
          orderNumber: updatedOrder.orderNumber,
        });

        await db.notification.create({
          data: {
            userId: updatedOrder.customer.userId,
            orderId: updatedOrder.id,
            type: 'WHATSAPP_DISPATCH_UPDATE',
            recipient: customerPhone,
            content: `Dispatch update sent via Fast2SMS WhatsApp: Agent ${agentName} on the way.`,
            status: whatsappResult.success ? 'SENT' : 'FAILED',
            provider: 'FAST2SMS',
            providerRequestId: whatsappResult.requestId || null,
            deliveryStatus: whatsappResult.success ? 'sent' : 'failed',
            statusDescription: whatsappResult.error || 'Sent via Fast2SMS API',
          },
        });
      } catch (whatsappErr: any) {
        console.warn('[WHATSAPP DISPATCH TRIGGER NOTICE] Safe notification error:', whatsappErr?.message);
      }
    });

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Start journey error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to start journey.', 500);
  }
}
