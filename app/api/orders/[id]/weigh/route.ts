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
  const startedAt = Date.now();
  const logTiming = (phase: string) =>
    console.info(`[api/orders/weigh] ${phase} elapsedMs=${Date.now() - startedAt}`);
  try {
    const { id } = await params;
    const authUser = await getAuthUser(req);
    logTiming('authentication complete');
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
    logTiming('order lookup complete');

    if (!order) {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (!order.agentId || order.agentId !== authUser.agentId) {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    if (['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'].includes(order.status) && order.weightRecords.length > 0) {
      return successResponse(order, 200, { message: 'Order was already completed.' });
    }

    const oldStatus = order.status;
    const newStatus = 'WEIGHING';

    if (!validateStatusTransition(oldStatus, newStatus)) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot record weights from current status (${oldStatus}).`, 400);
    }

    for (const itemInput of actualWeights) {
      const dbItem = order.items.find(
        (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput?.categoryId || i.id === itemInput?.categoryId
      );
      if (!dbItem || typeof itemInput.actualWeight !== 'number' || !Number.isFinite(itemInput.actualWeight) || itemInput.actualWeight <= 0) {
        return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must be a positive number for a valid order item.', 400);
      }
    }

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    // Execute Weighing Update in Transaction
    const updatedOrder = await db.$transaction(async (tx) => {
      let actualTotalRecyclable = 0;
      let actualTotalWasteCharge = 0;

      for (const itemInput of actualWeights) {
        const dbItem = order.items.find(
          (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput.categoryId || i.id === itemInput.categoryId
        );
        if (dbItem) {
          const weightKg = itemInput.actualWeight;
          const subtotal = round2(weightKg * dbItem.ratePerKg);

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
      const finalAmount = round2(Math.abs(netAmount));
      const totalWeightKg = actualWeights.reduce((total: number, input: any) => total + input.actualWeight, 0);

      // Create WeightRecord
      await tx.weightRecord.create({
        data: {
          orderId: id,
          recordedByUserId: authUser?.userId || order.agent?.userId || order.customer?.userId,
          scalePhotoUrl: typeof scalePhotoUrl === 'string' && scalePhotoUrl.trim()
            ? scalePhotoUrl.trim()
            : null,
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
    }, {
      maxWait: 10000,
      timeout: 15000,
    });

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('WEIGHING_STARTED', { orderId: id, actualTotal: updatedOrder.actualTotal });
    logTiming('response ready');

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Record weighing error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to record scale weights.', 500);
  }
}
