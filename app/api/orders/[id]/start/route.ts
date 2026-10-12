import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { sendDispatchUpdate } from '@/lib/services/whatsappService';

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

    // Phase 5A: Fast2SMS WhatsApp Dispatch Update Notification Trigger
    try {
      const customerPhone = updatedOrder.customer?.user?.phone;
      const customerName = updatedOrder.customer?.user?.name || 'Valued Customer';
      const agentName = updatedOrder.agent?.user?.name || 'Field Agent';
      const agentPhone = updatedOrder.agent?.user?.phone || '';

      if (customerPhone) {
        // Idempotency check: Ensure WhatsApp Dispatch Update is not duplicated for the same order
        const existingNotification = await db.notification.findFirst({
          where: {
            orderId: updatedOrder.id,
            type: 'WHATSAPP_DISPATCH_UPDATE',
          },
        });

        if (!existingNotification) {
          const whatsappResult = await sendDispatchUpdate({
            customerPhone,
            customerName,
            agentName,
            agentPhone,
            estimatedArrival: '20-30 mins',
            orderNumber: updatedOrder.orderNumber,
          });

          // Record notification attempt in DB
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
        }
      }
    } catch (whatsappErr: any) {
      // Notification failures MUST NEVER roll back the order status or journey start!
      console.warn('[WHATSAPP DISPATCH TRIGGER NOTICE] Safe notification error:', whatsappErr?.message);
    }

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Start journey error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to start journey.', 500);
  }
}
