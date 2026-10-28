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

    const body = await req.json().catch(() => ({}));
    const { actualWeights, scalePhotoUrl, notes } = body;
    const hasWeightPayload = Array.isArray(actualWeights) && actualWeights.length > 0;

    // Verify weighing record exists or valid scale weights are supplied in the request body
    if (order.weightRecords.length === 0 && !hasWeightPayload) {
      return errorResponse('WEIGHING_REQUIRED', 'Digital scale weights must be recorded before completing pickup.', 400);
    }

    if (hasWeightPayload) {
      for (const itemInput of actualWeights) {
        const dbItem = order.items.find(
          (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput?.categoryId || i.id === itemInput?.categoryId
        );
        if (!dbItem || typeof itemInput.actualWeight !== 'number' || !Number.isFinite(itemInput.actualWeight) || itemInput.actualWeight <= 0) {
          return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must be a positive number for a valid order item.', 400);
        }
      }
    }

    const oldStatus = order.status;
    const newStatus = 'PICKUP_COMPLETED';

    const isWeighingComplete = order.status === 'WEIGHING' || order.status === 'AGENT_ARRIVED' || order.status === 'WASTE_VERIFICATION';
    if (!validateStatusTransition(oldStatus, newStatus) && !isWeighingComplete) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot complete order from current status (${oldStatus}). Please complete weighing first.`, 400);
    }

    const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
    let actualTotalRecyclable = order.actualTotal;
    let financialDirection = order.financialDirection;
    let finalAmount = order.finalAmount;
    let totalWeightKg = 0;
    const itemUpdates: Array<{ id: string; actualWeight: number; subtotal: number }> = [];

    if (hasWeightPayload) {
      const matchedItemIds = new Set<string>();
      let calcRecyclable = 0;
      let calcWasteCharge = 0;
      for (const itemInput of actualWeights) {
        const dbItem = order.items.find(
          (i) => (itemInput?.itemId && i.id === itemInput.itemId) || i.categoryId === itemInput.categoryId || i.id === itemInput.categoryId
        );
        if (dbItem) {
          if (matchedItemIds.has(dbItem.id)) {
            return errorResponse('INVALID_WEIGH_DATA', 'Each order item may only have one actual weight entry.', 400);
          }
          matchedItemIds.add(dbItem.id);
          const weightKg = itemInput.actualWeight;
          const subtotal = round2(weightKg * dbItem.ratePerKg);
          if (dbItem.category.type === 'WASTE_CHARGE') {
            calcWasteCharge += subtotal;
          } else {
            calcRecyclable += subtotal;
          }
          itemUpdates.push({ id: dbItem.id, actualWeight: weightKg, subtotal });
        }
      }
      actualTotalRecyclable = calcRecyclable;
      const netAmount = actualTotalRecyclable - (calcWasteCharge + order.pickupCharge - order.discountAmount);
      financialDirection = netAmount >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS';
      finalAmount = round2(Math.abs(netAmount));
      totalWeightKg = actualWeights.reduce((total: number, input: any) => total + input.actualWeight, 0);
    }

    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute completion (and optional weighing) in transaction with CAS
    const completedOrder = await db.$transaction(async (tx) => {
      // 1. If weights are supplied directly in this request, update order items and persist WeightRecord
      if (hasWeightPayload) {
        for (const update of itemUpdates) {
          await tx.orderItem.update({
            where: { id: update.id },
            data: {
              actualWeight: update.actualWeight,
              subtotal: update.subtotal,
            },
          });
        }

        await tx.weightRecord.create({
          data: {
            orderId: id,
            recordedByUserId: authUser?.userId || order.agent?.userId || order.customer?.userId,
            scalePhotoUrl: scalePhotoUrl || 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?q=80&w=600',
            weightJson: JSON.stringify(actualWeights),
            notes: notes || 'Scale weights recorded at doorstep.',
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
      }

      const invoiceItems = hasWeightPayload
        ? order.items.map((i) => {
            const matched = itemUpdates.find((u) => u.id === i.id);
            return matched ? { ...i, actualWeight: matched.actualWeight, subtotal: matched.subtotal } : i;
          })
        : order.items;

      const claimed = await tx.order.updateMany({
        where: {
          id,
          status: oldStatus,
          agentId: authUser.agentId,
        },
        data: {
          status: newStatus,
          paymentStatus: financialDirection === 'JUNKITOUT_PAYS' ? 'SETTLEMENT_PENDING' : order.paymentStatus,
          ...(hasWeightPayload ? {
            actualTotal: actualTotalRecyclable,
            financialDirection: financialDirection,
            finalAmount: finalAmount,
          } : {}),
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
          notes: hasWeightPayload
            ? `Doorstep scale weights recorded and pickup completed. Net amount: ₹${finalAmount.toFixed(2)}`
            : `Pickup completed at doorstep by agent.`,
        },
      });

      if (!order.invoices || order.invoices.length === 0) {
        await tx.invoice.create({
          data: {
            orderId: id,
            invoiceNumber,
            totalAmount: finalAmount,
            pdfDataJson: JSON.stringify({
              orderNumber: order.orderNumber,
              invoiceNumber,
              items: invoiceItems,
              finalAmount: finalAmount,
              financialDirection: financialDirection,
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
    if (hasWeightPayload) {
      broadcaster.broadcast('WEIGHING_STARTED', {
        orderId: id,
        actualTotal: completedOrder.actualTotal,
      });
    }
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
