import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateStatusTransition } from '@/lib/validations/schemas';
import { broadcaster } from '@/lib/realtime';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { runBackgroundTask } from '@/lib/utils/backgroundTask';
import { calculateOrderValuation, calculateValuationAdjustment, type CalculationItemInput } from '@/lib/pricing';
import { refundAttemptId } from '@/lib/payments/refundWorkflow';

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
        agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
        customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
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
    if (!hasWeightPayload) {
      if (order.weightRecords.length === 0) {
        return errorResponse('WEIGHING_REQUIRED', 'Digital scale weights must be recorded before completing pickup.', 400);
      }
      if (!order.items || order.items.length === 0) {
        return errorResponse('WEIGHING_REQUIRED', 'Order has no items to complete.', 400);
      }
      const unweighedItem = order.items.find(
        (item) => typeof item.actualWeight !== 'number' || !Number.isFinite(item.actualWeight) || item.actualWeight <= 0
      );
      if (unweighedItem) {
        return errorResponse('WEIGHING_REQUIRED', 'All order items must have valid recorded weights. All order items must have recorded scale weights before completing pickup.', 400);
      }
    }

    const orderItemsById = new Map(order.items.map((item) => [item.id, item]));

    if (hasWeightPayload) {
      if (!order.items || order.items.length === 0) {
        return errorResponse('INVALID_WEIGH_DATA', 'Order has no items to weigh.', 400);
      }
      const submittedItemIds = new Set<string>();
      for (const itemInput of actualWeights) {
        const itemId = itemInput?.itemId;
        const dbItem = typeof itemId === 'string' ? orderItemsById.get(itemId) : undefined;

        if (!dbItem) {
          return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must reference a valid order item ID.', 400);
        }

        if (submittedItemIds.has(itemId)) {
          return errorResponse('INVALID_WEIGH_DATA', 'Each order item must have exactly one actual weight.', 400);
        }

        if (typeof itemInput.actualWeight !== 'number' || !Number.isFinite(itemInput.actualWeight) || itemInput.actualWeight <= 0) {
          return errorResponse('INVALID_WEIGH_DATA', 'Each actual weight must be a positive number for a valid order item.', 400);
        }

        submittedItemIds.add(itemId);
      }

      if (submittedItemIds.size !== orderItemsById.size) {
        return errorResponse('INVALID_WEIGH_DATA', 'Each order item must have exactly one actual weight.', 400);
      }
    }

    const oldStatus = order.status;
    const newStatus = 'PICKUP_COMPLETED';

    const isWeighingComplete = order.status === 'WEIGHING' || order.status === 'AGENT_ARRIVED' || order.status === 'WASTE_VERIFICATION';
    if (!validateStatusTransition(oldStatus, newStatus) && !isWeighingComplete) {
      return errorResponse('INVALID_STATUS_TRANSITION', `Cannot complete order from current status (${oldStatus}). Please complete weighing first.`, 400);
    }

    let actualTotalRecyclable = order.actualTotal;
    let financialDirection = order.financialDirection;
    let finalAmount = order.finalAmount;
    let totalWeightKg = 0;
    const itemUpdates: Array<{ id: string; actualWeight: number; subtotal: number }> = [];

    let completionValuation: any = null;
    if (hasWeightPayload) {
      const calculationItems: CalculationItemInput[] = [];
      for (const itemInput of actualWeights) {
        const dbItem = orderItemsById.get(itemInput.itemId);
        if (dbItem) {
          calculationItems.push({
            categoryId: dbItem.categoryId,
            categoryName: dbItem.category?.name || dbItem.categoryId,
            type: dbItem.category?.type || 'RECYCLABLE_BUY',
            pricePerKg: dbItem.ratePerKg,
            weightKg: itemInput.actualWeight,
          });
        }
      }

      completionValuation = calculateOrderValuation(
        calculationItems,
        order.pickupCharge,
        order.discountAmount
      );

      for (let i = 0; i < actualWeights.length; i++) {
        const itemInput = actualWeights[i];
        const vi = completionValuation.items[i];
        if (vi) {
          itemUpdates.push({ id: itemInput.itemId, actualWeight: vi.weightKg, subtotal: vi.subtotal });
        }
      }

      actualTotalRecyclable = completionValuation.totalRecyclableValue;
      financialDirection = completionValuation.financialDirection;
      finalAmount = completionValuation.netAmount;
      totalWeightKg = actualWeights.reduce((total: number, input: any) => total + input.actualWeight, 0);
    }

    const invoiceNumber = `INV-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Execute completion (and optional weighing) in transaction
    const completionResult = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${id} FOR UPDATE`;

      const currentOrder = await tx.order.findUnique({
        where: { id },
        include: {
          agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          items: { include: { category: true } },
          weightRecords: { orderBy: { createdAt: 'desc' }, take: 1 },
          invoices: { take: 1 },
        },
      });

      if (!currentOrder) {
        return { kind: 'notFound' as const };
      }

      if (!currentOrder.agentId || currentOrder.agentId !== authUser.agentId) {
        return { kind: 'forbidden' as const };
      }

      if (currentOrder.status === 'PICKUP_COMPLETED' || currentOrder.status === 'SETTLEMENT_COMPLETED') {
        return { kind: 'alreadyCompleted' as const, order: currentOrder };
      }

      const currentStatusIsCompletable =
        validateStatusTransition(currentOrder.status, newStatus) ||
        currentOrder.status === 'WEIGHING' ||
        currentOrder.status === 'AGENT_ARRIVED' ||
        currentOrder.status === 'WASTE_VERIFICATION';
      if (!currentStatusIsCompletable) {
        return { kind: 'invalidTransition' as const, status: currentOrder.status };
      }

      // Verify all items have valid scale weights when completing without weight payload
      if (!hasWeightPayload) {
        const itemsToCheck = currentOrder.items && currentOrder.items.length > 0 ? currentOrder.items : order.items;
        const unweighed = itemsToCheck.find(
          (item: any) => typeof item.actualWeight !== 'number' || !Number.isFinite(item.actualWeight) || item.actualWeight <= 0
        );
        const wrCount = currentOrder.weightRecords?.length ?? order.weightRecords.length;
        if (unweighed || wrCount === 0) {
          return { kind: 'incompleteWeighing' as const };
        }
      }

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
            scalePhotoUrl: typeof scalePhotoUrl === 'string' && scalePhotoUrl.trim()
              ? scalePhotoUrl.trim()
              : null,
            weightJson: JSON.stringify(actualWeights),
            notes: notes || 'Scale weights recorded at doorstep.',
          },
        });

        if (completionValuation) {
          const capturedPayment = (tx as any).payment?.findFirst ? await (tx as any).payment.findFirst({
            where: { orderId: id, direction: 'CUSTOMER_PAYS', status: 'CAPTURED' },
          }) : null;
          const customerPaidAmount = capturedPayment ? Number(capturedPayment.amount) : 0;
          const adjustment = calculateValuationAdjustment(customerPaidAmount, completionValuation);

          if (capturedPayment && adjustment.refundAmount > 0) {
            const attemptId = refundAttemptId(capturedPayment.id, `complete_${adjustment.adjustmentType.toLowerCase()}`);
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
        }

        if (financialDirection === 'JUNKITOUT_PAYS' && finalAmount > 0) {
          await tx.settlement.upsert({
            where: { orderId: id },
            create: {
              orderId: id,
              customerId: currentOrder.customerId,
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

      const orderUpdateData: any = {
        status: newStatus,
        paymentStatus: financialDirection === 'JUNKITOUT_PAYS' ? 'SETTLEMENT_PENDING' : currentOrder.paymentStatus,
        statusHistory: {
          create: {
            oldStatus: currentOrder.status,
            newStatus,
            changedByUserId: authUser?.userId || null,
            notes: hasWeightPayload
              ? `Doorstep scale weights recorded and pickup completed. Net amount: ₹${finalAmount.toFixed(2)}`
              : `Pickup completed at doorstep by agent.`,
          },
        },
      };

      if (hasWeightPayload) {
        orderUpdateData.actualTotal = actualTotalRecyclable;
        orderUpdateData.financialDirection = financialDirection;
        orderUpdateData.finalAmount = finalAmount;
      }

      if (!currentOrder.invoices || currentOrder.invoices.length === 0) {
        if (typeof (tx as any).invoice?.create === 'function') {
          await (tx as any).invoice.create({
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
        } else {
          orderUpdateData.invoices = {
            create: {
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
          };
        }
      }

      const updated = await tx.order.update({
        where: { id },
        data: orderUpdateData,
        include: {
          agent: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          customer: { include: { user: { select: { id: true, name: true, phone: true, email: true, role: true } } } },
          address: true,
          items: { include: { category: true } },
          weightRecords: true,
          invoices: true,
        },
      });
      logTiming('completion transaction complete');

      if (currentOrder.agentId) {
        await tx.agent.update({
          where: { id: currentOrder.agentId },
          data: { status: 'AVAILABLE' },
        });
      }

      return { kind: 'completed' as const, order: updated };
    }, {
      maxWait: 10000,
      timeout: 25000,
    });

    if (completionResult.kind === 'notFound') {
      return errorResponse('ORDER_NOT_FOUND', `Order #${id} not found.`, 404);
    }

    if (completionResult.kind === 'forbidden') {
      return errorResponse('FORBIDDEN', 'Order is assigned to another agent.', 403);
    }

    if (completionResult.kind === 'alreadyCompleted') {
      return successResponse(completionResult.order, 200, { message: 'Order was already completed.' });
    }

    if (completionResult.kind === 'invalidTransition') {
      return errorResponse(
        'INVALID_STATUS_TRANSITION',
        `Cannot complete order from current status (${completionResult.status}). Please complete weighing first.`,
        400,
      );
    }

    if (completionResult.kind === 'incompleteWeighing') {
      return errorResponse(
        'WEIGHING_REQUIRED',
        'All order items must have valid recorded weights. All order items must have recorded scale weights before completing pickup.',
        400,
      );
    }

    const completedOrder = completionResult.order;

    broadcaster.broadcast('ORDER_UPDATED', completedOrder);
    broadcaster.broadcast('ORDER_COMPLETED', {
      orderId: id,
      agentId: completedOrder.agentId,
      invoiceNumber,
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
