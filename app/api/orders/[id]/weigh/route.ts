import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { calculateOrderValuation, calculateValuationAdjustment, type CalculationItemInput } from '@/lib/pricing';
import { refundAttemptId } from '@/lib/payments/refundWorkflow';

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
        agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
        customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
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

    const matchedItemIds = new Set<string>();
    for (const itemInput of actualWeights) {
      const dbItem = order.items.find(
        (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput?.categoryId || i.id === itemInput?.categoryId
      );
      if (!dbItem || typeof itemInput.actualWeight !== 'number' || !Number.isFinite(itemInput.actualWeight) || itemInput.actualWeight <= 0) {
        return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must be a positive number for a valid order item.', 400);
      }
      if (matchedItemIds.has(dbItem.id)) {
        return errorResponse('INVALID_WEIGH_DATA', 'Each order item may only have one actual weight entry.', 400);
      }
      matchedItemIds.add(dbItem.id);
    }

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

    // Execute Weighing Update in Transaction
    const updatedOrder = await db.$transaction(async (tx) => {
      const calculationItems: CalculationItemInput[] = [];
      const txMatchedItemIds = new Set<string>();

      for (const itemInput of actualWeights) {
        const dbItem = order.items.find(
          (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput.categoryId || i.id === itemInput.categoryId
        );
        if (dbItem) {
          if (txMatchedItemIds.has(dbItem.id)) {
            throw new Error('Duplicate weight entry for the same order item.');
          }
          txMatchedItemIds.add(dbItem.id);
          const weightKg = itemInput.actualWeight;
          calculationItems.push({
            categoryId: dbItem.categoryId,
            categoryName: dbItem.category?.name || dbItem.categoryId,
            type: dbItem.category?.type || 'RECYCLABLE_BUY',
            pricePerKg: dbItem.ratePerKg,
            weightKg,
          });
        }
      }

      const valuation = calculateOrderValuation(
        calculationItems,
        order.pickupCharge,
        order.discountAmount
      );

      for (let i = 0; i < actualWeights.length; i++) {
        const itemInput = actualWeights[i];
        const vi = valuation.items[i];
        if (vi) {
          await tx.orderItem.update({
            where: { id: itemInput.itemId },
            data: {
              actualWeight: vi.weightKg,
              subtotal: vi.subtotal,
            },
          });
        }
      }

      const actualTotalRecyclable = valuation.totalRecyclableValue;
      const financialDirection = valuation.financialDirection;
      const finalAmount = valuation.netAmount;
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

      // Update Order Status & Financial Totals with CAS
      let updated: any;
      if (typeof tx.order.updateMany === 'function') {
        const claimed = await tx.order.updateMany({
          where: {
            id,
            status: oldStatus,
            agentId: authUser.agentId,
          },
          data: {
            status: newStatus,
            actualTotal: actualTotalRecyclable,
            financialDirection,
            finalAmount,
          },
        });

        if (claimed.count !== 1) {
          return null;
        }

        if (tx.orderStatusHistory?.create) {
          await tx.orderStatusHistory.create({
            data: {
              orderId: id,
              oldStatus,
              newStatus,
              changedByUserId: authUser?.userId || null,
              notes: `Recorded doorstep digital scale weights. Net amount: ₹${finalAmount.toFixed(2)}`,
            },
          });
        }

        updated = tx.order.findUnique
          ? await tx.order.findUnique({
              where: { id },
              include: {
                agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
                customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
                address: true,
                items: { include: { category: true } },
                weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
              },
            })
          : { id, status: newStatus, actualTotal: actualTotalRecyclable, financialDirection, finalAmount };
      } else {
        updated = await tx.order.update({
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
        });
      }

      // Valuation adjustment check against captured payments
      const capturedPayment = (tx as any).payment?.findFirst ? await (tx as any).payment.findFirst({
        where: { orderId: id, direction: 'CUSTOMER_PAYS', status: 'CAPTURED' },
      }) : null;
      const customerPaidAmount = capturedPayment ? Number(capturedPayment.amount) : 0;
      const adjustment = calculateValuationAdjustment(customerPaidAmount, valuation);

      // Record any required refund attempt (partial or full)
      if (capturedPayment && adjustment.refundAmount > 0) {
        const attemptId = refundAttemptId(capturedPayment.id, `weigh_${adjustment.adjustmentType.toLowerCase()}`);
        if ((tx as any).refundAttempt?.createMany) {
          await (tx as any).refundAttempt.createMany({
            data: [{
              id: attemptId,
              orderId: id,
              paymentId: capturedPayment.id,
              amount: adjustment.refundAmount,
              status: 'PENDING',
              failureReason: adjustment.explanation,
            }],
            skipDuplicates: true,
          });
        }
      }

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

    if (!updatedOrder) {
      const recheck = await db.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          address: true,
          items: { include: { category: true } },
          weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
        },
      });
      if (recheck?.status === newStatus || recheck?.status === 'PICKUP_COMPLETED') {
        return successResponse(recheck);
      }
      return errorResponse('CONFLICT', 'The order state changed or was cancelled before recording weights.', 409);
    }

    broadcaster.broadcast('ORDER_UPDATED', updatedOrder);
    broadcaster.broadcast('WEIGHING_STARTED', { orderId: id, actualTotal: updatedOrder.actualTotal });
    logTiming('response ready');

    return successResponse(updatedOrder);
  } catch (err: any) {
    console.error('Record weighing error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to record scale weights.', 500);
  }
}
