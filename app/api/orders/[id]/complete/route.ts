import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { runBackgroundTask } from '@/lib/utils/backgroundTask';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const startedAt = Date.now();
  const logTiming = (phase: string) =>
    console.info(`[api/orders/complete] ${phase} elapsedMs=${Date.now() - startedAt}`);
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    logTiming('authentication complete');
    if (!authUser || authUser.role !== 'AGENT') {
      return errorResponse('UNAUTHORIZED', 'Authenticated agent access is required.', 401);
    }

    const order = await db.order.findUnique({
      where: { id },
      include: {
        agent: { include: { user: true } },
        customer: { include: { user: true } },
        items: { include: { category: true } },
        weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        invoices: { take: 1 },
      },
    });
    logTiming('order lookup complete');

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (!order.agentId || order.agentId !== authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    if (order.status === 'PICKUP_COMPLETED' || order.status === 'SETTLEMENT_COMPLETED') {
      return successResponse(order, 200, { message: 'Order was already completed.' });
    }

    // Verify weighing record exists
    if (order.weightRecords.length === 0) {
      return errorResponse('WEIGHING_REQUIRED', 'Digital scale weights must be recorded before completing pickup.', 400);
    }

    const oldStatus = order.status;
    const newStatus = 'PICKUP_COMPLETED';

    const isWeighingComplete = order.status === 'WEIGHING' || order.status === 'AGENT_ARRIVED' || order.status === 'WASTE_VERIFICATION';
    if (!validateStatusTransition(oldStatus, newStatus) && !isWeighingComplete) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot complete order from current status (${oldStatus}). Please complete weighing first.`, 400);
    }

    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute completion in transaction with compare-and-swap
    const completedOrder = await db.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: {
          id,
          status: oldStatus,
          agentId: authUser.agentId,
        },
        data: {
          status: newStatus,
          paymentStatus: order.financialDirection === 'JUNKITOUT_PAYS' ? 'SETTLEMENT_PENDING' : order.paymentStatus,
        },
      });

      if (claimed.count !== 1) {
        return null;
      }

      await tx.orderStatusHistory.create({
        data: {
          orderId: id,
          oldStatus,
          newStatus,
          changedByUserId: authUser?.userId || null,
          notes: `Pickup completed at doorstep by agent.`,
        },
      });

      if (!order.invoices || order.invoices.length === 0) {
        await tx.invoice.create({
          data: {
            orderId: id,
            invoiceNumber,
            totalAmount: order.finalAmount,
            pdfDataJson: JSON.stringify({
              orderNumber: order.orderNumber,
              invoiceNumber,
              items: order.items,
              finalAmount: order.finalAmount,
              financialDirection: order.financialDirection,
            }),
          },
        });
      }

      if (order.agentId) {
        await tx.agent.update({
          where: { id: order.agentId },
          data: { status: 'AVAILABLE' },
        });
      }

      return tx.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: true } },
          customer: { include: { user: true } },
          address: true,
          items: { include: { category: true } },
          weightRecords: true,
          invoices: true,
        },
      });
    }, {
      isolationLevel: 'Serializable',
      maxWait: 10000,
      timeout: 15000,
    });

    if (!completedOrder) {
      const recheck = await db.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: true } },
          customer: { include: { user: true } },
          address: true,
          items: { include: { category: true } },
          weightRecords: true,
          invoices: true,
        },
      });
      if (recheck?.status === 'PICKUP_COMPLETED' || recheck?.status === 'SETTLEMENT_COMPLETED') {
        return successResponse(recheck, 200, { message: 'Order was already completed.' });
      }
      return errorResponse('CONFLICT', 'The order state changed or was cancelled before completion.', 409);
    }

    broadcaster.broadcast('ORDER_UPDATED', completedOrder);
    broadcaster.broadcast('ORDER_COMPLETED', {
      orderId: id,
      agentId: completedOrder.agentId,
      invoiceNumber: completedOrder.invoices?.[0]?.invoiceNumber || invoiceNumber,
    });
    logTiming('response ready');

    runBackgroundTask(async () => {
      try {
        const customerUserId = completedOrder.customer?.userId;
        const customerPhone = completedOrder.customer?.user?.phone;
        if (!customerUserId || !customerPhone) return;

        const invNum = completedOrder.invoices?.[0]?.invoiceNumber || invoiceNumber;
        await db.notification.create({
          data: {
            userId: customerUserId,
            orderId: id,
            type: 'WHATSAPP',
            recipient: customerPhone,
            content: `Pickup #${completedOrder.orderNumber} completed! Invoice ${invNum} generated. Total: ₹${completedOrder.finalAmount.toFixed(2)}. Thank you for recycling with Junk It Out.`,
            status: 'SENT',
          },
        });
      } catch (notifErr: any) {
        console.warn('[COMPLETE NOTIFICATION NOTICE] Safe notification error:', notifErr?.message);
      }
    });

    return successResponse(completedOrder);
  } catch (err: any) {
    console.error('Complete order error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to complete order.', 500);
  }
}
