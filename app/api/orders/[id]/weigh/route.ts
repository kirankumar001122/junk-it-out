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

    const body = await req.json().catch(() => ({}));
    const { actualWeights, scalePhotoUrl, notes } = body;

    if (!Array.isArray(actualWeights) || actualWeights.length === 0) {
      return errorResponse('INVALID_WEIGH_DATA', 'Itemized actual weights array is required.', 400);
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

    if (order.status === 'WEIGHING' && order.weightRecords.length > 0) {
      return successResponse(order, 200, { message: 'Weights were already recorded for this order.' });
    }

    const oldStatus = order.status;
    const newStatus = 'WEIGHING';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot record weights from current status (${oldStatus}).`, 400);
    }

    for (const itemInput of actualWeights) {
      const dbItem = order.items.find(
        (i) => i.categoryId === itemInput?.categoryId || i.id === itemInput?.categoryId
      );
      if (!dbItem || typeof itemInput.actualWeight !== 'number' || !Number.isFinite(itemInput.actualWeight) || itemInput.actualWeight <= 0) {
        return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must be a positive number for a valid order item.', 400);
      }
    }

    // Execute Weighing Update in Transaction
    const updatedOrder = await db.$transaction(async (tx) => {
      let actualTotalRecyclable = 0;
      let actualTotalWasteCharge = 0;

      for (const itemInput of actualWeights) {
        const dbItem = order.items.find(
          (i) => i.categoryId === itemInput.categoryId || i.id === itemInput.categoryId
        );
        if (dbItem) {
          const weightKg = itemInput.actualWeight;
          const subtotal = weightKg * dbItem.ratePerKg;

          if (dbItem.category.type === 'WASTE_CHARGE') {
            actualTotalWasteCharge += subtotal;
          } else {
            actualTotalRecyclable += subtotal;
          }

          await tx.orderItem.update({
            where: { id: dbItem.id },
            data: {
              actualWeight: weightKg,
              subtotal,
            },
          });
        }
      }

      const netAmount = actualTotalRecyclable - (actualTotalWasteCharge + order.pickupCharge - order.discountAmount);
      const financialDirection = netAmount >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS';
      const finalAmount = Math.abs(netAmount);
      const totalWeightKg = actualWeights.reduce((total: number, input: any) => total + input.actualWeight, 0);

      // Create WeightRecord
      await tx.weightRecord.create({
        data: {
          orderId: id,
          recordedByUserId: authUser?.userId || order.agent?.userId || order.customerId,
          scalePhotoUrl: scalePhotoUrl || 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=600',
          weightJson: JSON.stringify(actualWeights),
          notes: notes || 'Scale weights recorded at doorstep.',
        },
      });

      // Update Order Status & Financial Totals
      const updated = await tx.order.update({
        where: { id },
        data: {
          status: newStatus,
          actualTotal: actualTotalRecyclable,
          financialDirection,
          finalAmount,
          statusHistory: {
            create: {
              oldStatus,
              newStatus,
              changedByUserId: authUser?.userId || null,
              notes: `Recorded doorstep digital scale weights. Net amount: ₹${finalAmount.toFixed(2)}`,
            },
          },
        },
        include: {
          agent: { include: { user: true } },
          customer: { include: { user: true } },
          address: true,
          items: { include: { category: true } },
          weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });

      if (financialDirection === 'JUNKITOUT_PAYS' && finalAmount > 0) {
        await tx.settlement.upsert({
          where: { orderId: id },
          create: {
            orderId: id,
            customerId: order.customerId,
            totalWeightKg,
            amount: finalAmount,
            breakdownJson: JSON.stringify({ items: actualWeights, calculatedAt: new Date().toISOString() }),
            status: 'PENDING',
          },
          update: {
            totalWeightKg,
            amount: finalAmount,
            breakdownJson: JSON.stringify({ items: actualWeights, calculatedAt: new Date().toISOString() }),
          },
        });
      }

      return updated;
    });

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('WEIGHING_STARTED', { orderId: id, actualTotal: updatedOrder.actualTotal });

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Record weighing error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to record scale weights.', 500);
  }
}
