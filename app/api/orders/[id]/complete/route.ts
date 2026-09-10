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
      include: {
        agent: { include: { user: true } },
        customer: { include: { user: true } },
        items: { include: { category: true } },
        weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (!order.agentId || order.agentId !== authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    if (order.status === 'PICKUP_COMPLETED' || order.status === 'SETTLEMENT_COMPLETED') {
      return successResponse(order, 200, { message: 'Order was already completed.' });
    }

    const oldStatus = order.status;
    const newStatus = 'PICKUP_COMPLETED';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot complete order from current status (${oldStatus}). Please complete weighing first.`, 400);
    }

    // Verify weighing record exists
    if (order.weightRecords.length === 0) {
      return errorResponse('WEIGHING_REQUIRED', 'Digital scale weights must be recorded before completing pickup.', 400);
    }

    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute completion in transaction
    const completedOrder = await db.$transaction(async (tx) => {
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          paymentStatus: order.financialDirection === 'JUNKITOUT_PAYS' ? 'SETTLEMENT_PENDING' : order.paymentStatus,
          statusHistory: {
            create: {
              oldStatus,
              newStatus,
              changedByUserId: authUser?.userId || null,
              notes: `Pickup completed at doorstep by agent.`,
            },
          },
          invoices: {
            create: {
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
          },
        },
        include: {
          agent: { include: { user: true } },
          customer: { include: { user: true } },
          address: true,
          items: { include: { category: true } },
          weightRecords: true,
          invoices: true,
        },
      });

      if (order.agentId) {
        await tx.agent.update({
          where: { id: order.agentId },
          data: { status: 'AVAILABLE' },
        });
      }

      return updated;
    });

    broadcaster.broadcast('ORDER_UPDATED', completedOrder);
    broadcaster.broadcast('ORDER_COMPLETED', { orderId: id, invoiceNumber });

    return successResponse(completedOrder);
  } catch (err: any) {
    console.error('Complete order error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to complete order.', 500);
  }
}
