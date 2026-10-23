import { db } from '@/lib/db';
import {
  fetchRazorpayPayment,
  fetchRazorpayOrderPayments,
  verifyRazorpayPaymentSignature,
} from './razorpay';

import {
  findEligibleAgentsForServiceArea,
} from '@/lib/services/agentService';

import { broadcaster } from '@/lib/realtime';
import { transitionOrder } from '@/lib/services/orderLifecycle';

export class PaymentVerificationError extends Error {
  statusCode: number;

  constructor(
    message: string,
    statusCode = 400
  ) {
    super(message);
    this.statusCode = statusCode;
  }
}

export type PaymentReconciliationActor = {
  role: string;
  customerId?: string | null;
};

export function isCustomerReconciliationActor(
  actor: PaymentReconciliationActor,
): actor is PaymentReconciliationActor & { role: 'CUSTOMER'; customerId: string } {
  return actor.role === 'CUSTOMER' && Boolean(actor.customerId);
}

export function assertCanReconcileOrder(
  order: { customerId: string },
  actor: PaymentReconciliationActor,
) {
  if (!isCustomerReconciliationActor(actor)) {
    throw new PaymentVerificationError(
      'Authenticated customer access is required.',
      403,
    );
  }
  if (order.customerId !== actor.customerId) {
    throw new PaymentVerificationError(
      'You are not authorized to reconcile payment for this order.',
      403,
    );
  }
}

// =========================================================
// DISPATCH PAID ORDER TO AGENTS
// =========================================================
//
// IMPORTANT:
// This function ONLY dispatches an order when:
//
// paymentStatus === 'CAPTURED'
// AND
// financialDirection === 'CUSTOMER_PAYS'
//
// Therefore unpaid orders can never be sent to agents.
// =========================================================

export async function dispatchPaidOrderToAgents(
  orderId: string
) {
  try {
    // -------------------------------------------------------
    // 1. FETCH THE ORDER AGAIN FROM DATABASE
    // -------------------------------------------------------

    const order = await db.order.findUnique({
      where: {
        id: orderId,
      },

      include: {
        address: true,
        customer: {
          include: {
            user: true,
          },
        },
        agent: {
          include: {
            user: true,
          },
        },
        items: {
          include: {
            category: true,
          },
        },
      },
    });

    // -------------------------------------------------------
    // 2. ORDER MUST EXIST
    // -------------------------------------------------------

    if (!order) {
      console.warn(
        `[DISPATCH] Order ${orderId} not found.`
      );

      return;
    }

    // -------------------------------------------------------
    // 3. FINAL PAYMENT SAFETY CHECK
    // -------------------------------------------------------

    if (
      order.paymentStatus !== 'CAPTURED'
    ) {
      console.log(
        `[DISPATCH] Order #${order.orderNumber} not dispatched because paymentStatus is ${order.paymentStatus}.`
      );

      return;
    }

    // -------------------------------------------------------
    // 4. ONLY CUSTOMER-PAYS ORDERS
    // -------------------------------------------------------

    if (
      order.financialDirection !==
      'CUSTOMER_PAYS'
    ) {
      console.log(
        `[DISPATCH] Order #${order.orderNumber} is not a CUSTOMER_PAYS order.`
      );

      return;
    }

    // -------------------------------------------------------
    // 5. CASE A: ORDER IS ALREADY ASSIGNED TO AN AGENT
    // -------------------------------------------------------

    if (order.agentId) {
      if (['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'].includes(order.status)) {
        const transition = await transitionOrder<any>({
          orderId: order.id,
          expectedStatus: order.status,
          expectedAgentId: order.agentId,
          newStatus: 'AGENT_ASSIGNED',
          additionalWhere: { paymentStatus: 'CAPTURED' },
          notes: 'Payment verified via Razorpay. Order confirmed and transitioned to AGENT_ASSIGNED.',
          include: {
            agent: { include: { user: true } },
            customer: { include: { user: true } },
            address: true,
            items: { include: { category: true } },
          },
          afterHistory: async (tx) => {
            await tx.agent.update({
              where: { id: order.agentId! },
              data: { status: 'ASSIGNED' },
            });
          },
        });
        if (transition.changed) {
          const updated = transition.order;
          broadcaster.broadcast('ORDER_UPDATED', updated);
          broadcaster.broadcast('ORDER_ASSIGNED', {
            orderId: order.id,
            orderNumber: order.orderNumber,
            agentId: order.agentId,
            agentName: order.agent?.user?.name,
          });
          broadcaster.broadcast('AGENT_ASSIGNED', {
            type: 'AGENT_ASSIGNED',
            orderId: order.id,
            orderNumber: order.orderNumber,
            customerId: order.customerId,
            userId: order.customer?.userId,
            agentId: order.agentId,
            agentName: order.agent?.user?.name,
            vehicleNumber: order.agent?.vehicleNumber,
            status: 'AGENT_ASSIGNED',
            assignedAt: new Date().toISOString(),
          });
        }
      }
      return;
    }

    if (!['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED'].includes(order.status)) {
      return;
    }

    // -------------------------------------------------------
    // 6. GET SERVICE AREA & FIND ELIGIBLE AGENTS
    // -------------------------------------------------------

    const targetServiceArea =
      order.address?.area || 'Bengaluru';

    const eligibleAgents =
      await findEligibleAgentsForServiceArea(
        targetServiceArea
      );

    const availableEligibleAgents =
      (eligibleAgents || []).filter(
        (agent: any) =>
          agent.status === 'AVAILABLE'
      );

    console.log(
      `[DISPATCH] Paid order #${order.orderNumber} for service area '${targetServiceArea}'. Available eligible agents count: ${availableEligibleAgents.length}`
    );

    // -------------------------------------------------------
    // 7. CASE B: AVAILABLE ELIGIBLE AGENTS FOUND -> AUTO-ASSIGN
    // -------------------------------------------------------

    if (availableEligibleAgents.length > 0) {
      // Pick best agent (highest rating or first available)
      const sortedAgents = [...availableEligibleAgents].sort(
        (a: any, b: any) => (Number(b.rating) || 0) - (Number(a.rating) || 0)
      );
      const selectedAgent = sortedAgents[0];

      const freshOrder = await db.$transaction(async (tx) => {
        const claimedOrder = await tx.order.updateMany({
          where: {
            id: order.id,
            agentId: null,
            status: order.status,
            paymentStatus: 'CAPTURED',
          },
          data: {
            agentId: selectedAgent.id,
            status: 'AGENT_ASSIGNED',
          },
        });
        if (claimedOrder.count !== 1) return null;

        const claimedAgent = await tx.agent.updateMany({
          where: { id: selectedAgent.id, status: 'AVAILABLE' },
          data: { status: 'ASSIGNED' },
        });
        if (claimedAgent.count !== 1) throw new Error('Selected agent is no longer available.');

        await tx.orderStatusHistory.create({
          data: {
            orderId: order.id,
            oldStatus: order.status,
            newStatus: 'AGENT_ASSIGNED',
            notes: `Payment verified via Razorpay. Order automatically assigned to field agent ${selectedAgent.user?.name || selectedAgent.id}.`,
          },
        });

        if (order.customer?.user) {
          await tx.notification.create({
            data: {
              userId: order.customer.userId,
              orderId: order.id,
              type: 'WHATSAPP',
              recipient: order.customer.user.phone,
              content: `Payment verified! Agent ${selectedAgent.user?.name || 'Partner'} (${selectedAgent.vehicleNumber}) has been assigned to your Junk It Out pickup #${order.orderNumber}.`,
              status: 'SENT',
            },
          });
        }

        return tx.order.findUnique({
          where: { id: order.id },
          include: {
            agent: { include: { user: true } },
            customer: { include: { user: true } },
            address: true,
            items: { include: { category: true } },
          },
        });
      });

      if (freshOrder) {
        broadcaster.broadcast('ORDER_UPDATED', freshOrder);
        broadcaster.broadcast('ORDER_ASSIGNED', {
          orderId: order.id,
          orderNumber: order.orderNumber,
          agentId: selectedAgent.id,
          agentName: selectedAgent.user?.name,
        });
        broadcaster.broadcast('AGENT_ASSIGNED', {
          type: 'AGENT_ASSIGNED',
          orderId: order.id,
          orderNumber: order.orderNumber,
          customerId: order.customerId,
          userId: order.customer?.userId,
          agentId: selectedAgent.id,
          agentName: selectedAgent.user?.name,
          vehicleNumber: selectedAgent.vehicleNumber,
          status: 'AGENT_ASSIGNED',
          assignedAt: new Date().toISOString(),
        });
        console.log(
          `[DISPATCH] Paid order #${order.orderNumber} successfully auto-assigned to agent ${selectedAgent.id}.`
        );
        return;
      }

      // Another dispatcher changed the order while this instance selected an
      // agent. Do not broadcast the stale order as available for pickup.
      return;
    }

    // -------------------------------------------------------
    // 8. CASE C: NO IMMEDIATELY AVAILABLE AGENT -> BROADCAST
    // -------------------------------------------------------

    const targetAgentIds = (eligibleAgents || []).map(
      (agent: any) => agent.id
    );

    const estimatedTotalWeight =
      order.items.reduce(
        (sum, item) => {
          return (
            sum +
            (Number(
              item.estimatedWeight
            ) || 0)
          );
        },
        0
      );

    const notificationPayload = {
      type: 'NEW_PICKUP_AVAILABLE',
      targetAgentIds,
      orderId: order.id,
      orderNumber: order.orderNumber,
      serviceArea: targetServiceArea,
      estimatedQuantity: `${estimatedTotalWeight.toFixed(1)} kg`,
      itemsSummary: `${order.items.length} category item(s)`,
      createdAt: order.createdAt.toISOString(),
    };

    broadcaster.broadcast(
      'NEW_PICKUP_AVAILABLE',
      notificationPayload
    );

    console.log(
      `[DISPATCH] No available agent immediately free. NEW_PICKUP_AVAILABLE broadcasted for paid order #${order.orderNumber}.`
    );
  } catch (error) {
    console.error(`[DISPATCH ERROR] Failed to dispatch paid order ${orderId}.`, {
      errorType: error instanceof Error ? error.name : 'UnknownError',
    });
    throw error;
  }
}

// =========================================================
// VERIFY AND RECORD PAYMENT
// =========================================================

export async function verifyAndRecordPayment(
  input: {
    orderId?: string;

    razorpayOrderId: string;

    razorpayPaymentId: string;

    razorpaySignature: string;

    customerId?: string | null;
  }
) {
  // -------------------------------------------------------
  // 1. FIND PAYMENT ATTEMPT
  // -------------------------------------------------------

  const payment =
    await db.payment.findFirst({
      where: {
        ...(input.orderId
          ? {
              orderId:
                input.orderId,
            }
          : {}),

        gatewayOrderId:
          input.razorpayOrderId,

        direction:
          'CUSTOMER_PAYS',
      },

      include: {
        order: true,
      },
    });

  // -------------------------------------------------------
  // 2. PAYMENT MUST EXIST
  // -------------------------------------------------------

  if (!payment) {
    throw new PaymentVerificationError(
      'Payment attempt not found.',
      404
    );
  }

  // -------------------------------------------------------
  // 3. CUSTOMER OWNERSHIP CHECK
  // -------------------------------------------------------

  if (
    input.customerId &&
    payment.order.customerId !==
      input.customerId
  ) {
    throw new PaymentVerificationError(
      'You are not authorized to verify this payment.',
      403
    );
  }

  // -------------------------------------------------------
  // 4. PREVENT PAYMENT ID REUSE
  // -------------------------------------------------------

  const reusedPayment =
    await db.payment.findFirst({
      where: {
        paymentId:
          input.razorpayPaymentId,

        id: {
          not: payment.id,
        },
      },
    });

  if (reusedPayment) {
    throw new PaymentVerificationError(
      'Razorpay payment ID has already been used.',
      409
    );
  }

  // 5. REFUND STATUS CHECK
  if (
    payment.status === 'REFUNDED' ||
    payment.status === 'PARTIALLY_REFUNDED' ||
    payment.status.startsWith('REFUND_') ||
    payment.order.paymentStatus === 'REFUNDED' ||
    payment.order.paymentStatus === 'PARTIALLY_REFUNDED' ||
    payment.order.paymentStatus.startsWith('REFUND_')
  ) {
    throw new PaymentVerificationError(
      'This payment has already been refunded or is undergoing refund reconciliation.',
      409
    );
  }

  // 6. ALREADY CAPTURED
  if (
    payment.status === 'CAPTURED' &&
    payment.paymentId ===
      input.razorpayPaymentId
  ) {
    // Ensure dispatch completes if order is still awaiting assignment
    await dispatchPaidOrderToAgents(payment.orderId);

    return {
      id: payment.id,

      orderId:
        payment.orderId,

      status:
        payment.status,
    };
  }

  // -------------------------------------------------------
  // 6. VERIFY RAZORPAY SIGNATURE
  // -------------------------------------------------------

  const validSignature =
    verifyRazorpayPaymentSignature(
      input.razorpayOrderId,
      input.razorpayPaymentId,
      input.razorpaySignature
    );

  if (!validSignature) {
    throw new PaymentVerificationError(
      'Invalid Razorpay payment signature.',
      400
    );
  }

  // -------------------------------------------------------
  // 7. FETCH PAYMENT FROM RAZORPAY
  // -------------------------------------------------------

  const providerPayment =
    await fetchRazorpayPayment(
      input.razorpayPaymentId
    );

  // -------------------------------------------------------
  // 8. VERIFY PAYMENT DETAILS
  // -------------------------------------------------------

  if (
    providerPayment.id !==
      input.razorpayPaymentId ||

    providerPayment.order_id !==
      input.razorpayOrderId ||

    providerPayment.currency !==
      'INR' ||

    providerPayment.amount !==
      Math.round(
        Number(payment.amount) * 100
      )
  ) {
    throw new PaymentVerificationError(
      'Razorpay payment does not match the expected order amount.',
      400
    );
  }

  // -------------------------------------------------------
  // 8B. VERIFY PAYMENT IS NOT REFUNDED AT PROVIDER
  // -------------------------------------------------------

  if (
    providerPayment.refund_status === 'full' ||
    (typeof providerPayment.amount_refunded === 'number' &&
      providerPayment.amount_refunded > 0 &&
      providerPayment.amount_refunded >= providerPayment.amount)
  ) {
    throw new PaymentVerificationError(
      'Razorpay reports that this payment has already been refunded.',
      409
    );
  }

  // -------------------------------------------------------
  // 9. DETERMINE PAYMENT STATUS
  // -------------------------------------------------------

  let localStatus:
    | 'CAPTURED'
    | 'AUTHORIZED'
    | null = null;

  if (
    providerPayment.status ===
    'captured'
  ) {
    localStatus =
      'CAPTURED';
  } else if (
    providerPayment.status ===
    'authorized'
  ) {
    localStatus =
      'AUTHORIZED';
  }

  // -------------------------------------------------------
  // 10. PAYMENT MUST BE AUTHORIZED OR CAPTURED
  // -------------------------------------------------------

  if (!localStatus) {
    throw new PaymentVerificationError(
      `Razorpay payment is not authorized or captured (${providerPayment.status}).`,
      400
    );
  }

  // -------------------------------------------------------
  // 11. UPDATE PAYMENT + ORDER
  // -------------------------------------------------------

  const result =
    await db.$transaction(
      async (tx) => {
        // -----------------------------------------------
        // UPDATE PAYMENT
        // -----------------------------------------------

        const updatedPayment =
          await tx.payment.update({
            where: {
              id: payment.id,
            },

            data: {
              paymentId:
                input.razorpayPaymentId,

              signature:
                input.razorpaySignature,

              status:
                localStatus,
            },
          });

        // -----------------------------------------------
        // UPDATE ORDER PAYMENT STATUS
        // -----------------------------------------------

        const updatedOrder =
          await tx.order.update({
            where: {
              id: payment.orderId,
            },

            data: {
              paymentStatus:
                localStatus,
            },
          });

        return {
          payment:
            updatedPayment,

          order:
            updatedOrder,
        };
      }
    );

  // -------------------------------------------------------
  // 12. DISPATCH ONLY AFTER CAPTURED
  // -------------------------------------------------------
  //
  // AUTHORIZED:
  //     No agent notification.
  //
  // CAPTURED:
  //     Agent notification is sent.
  //
  // PENDING / FAILED:
  //     This code never reaches dispatch.
  // -------------------------------------------------------

  if (
    localStatus === 'CAPTURED'
  ) {
    await dispatchPaidOrderToAgents(
      result.order.id
    );
  }

  // -------------------------------------------------------
  // 13. RETURN PAYMENT RESULT
  // -------------------------------------------------------

  return {
    id:
      result.payment.id,

    orderId:
      result.order.id,

    status:
      result.payment.status,
  };
}

// =========================================================
// RECONCILE PAYMENT FOR ORDER
// =========================================================

export async function reconcilePaymentForOrder(
  orderId: string,
  actor: PaymentReconciliationActor,
) {
  if (!isCustomerReconciliationActor(actor)) {
    throw new PaymentVerificationError(
      'Authenticated customer access is required.',
      403,
    );
  }

  const order = await db.order.findUnique({
    where: { id: orderId },
    include: {
      payments: {
        orderBy: { createdAt: 'desc' },
      },
    },
  });

  if (!order) {
    throw new PaymentVerificationError('Order not found.', 404);
  }

  assertCanReconcileOrder(order, actor);

  if (order.financialDirection !== 'CUSTOMER_PAYS') {
    return {
      orderId: order.id,
      status: 'NOT_REQUIRED',
      paymentStatus: order.paymentStatus,
      message: 'This order does not require customer payment.',
    };
  }

  if (
    order.paymentStatus === 'REFUNDED' ||
    order.paymentStatus === 'PARTIALLY_REFUNDED' ||
    order.paymentStatus.startsWith('REFUND_')
  ) {
    return {
      orderId: order.id,
      status: order.paymentStatus,
      paymentStatus: order.paymentStatus,
      reconciled: false,
      message: 'This order payment has already been refunded or is in refund reconciliation.',
    };
  }

  if (order.status === 'CANCELLED') {
    return {
      orderId: order.id,
      status: 'CANCELLED',
      paymentStatus: order.paymentStatus,
      reconciled: false,
      message: 'This order is cancelled and cannot be reconciled for payment.',
    };
  }

  if (order.paymentStatus === 'CAPTURED') {
    // If order is paid but not yet assigned, complete dispatch
    await dispatchPaidOrderToAgents(order.id);

    return {
      orderId: order.id,
      status: 'CAPTURED',
      alreadyPaid: true,
      paymentStatus: 'CAPTURED',
      message: 'Payment is already confirmed.',
    };
  }

  const candidatePayment = order.payments.find(
    (p) =>
      p.direction === 'CUSTOMER_PAYS' &&
      p.status !== 'FAILED' &&
      p.status !== 'REFUNDED' &&
      p.status !== 'PARTIALLY_REFUNDED' &&
      !p.status.startsWith('REFUND_')
  );

  if (!candidatePayment) {
    return {
      orderId: order.id,
      status: 'PENDING',
      paymentStatus: order.paymentStatus,
      candidatePayment: null,
    };
  }

  // 1. If we have a provider paymentId, check its status on Razorpay
  if (candidatePayment.paymentId) {
    try {
      const providerPayment = await fetchRazorpayPayment(
        candidatePayment.paymentId
      );

      const isRefundedAtProvider =
        providerPayment.refund_status === 'full' ||
        providerPayment.refund_status === 'partial' ||
        (typeof providerPayment.amount_refunded === 'number' &&
          providerPayment.amount_refunded > 0);

      if (isRefundedAtProvider) {
        const providerStatus = providerPayment.refund_status === 'full' ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        return {
          orderId: order.id,
          paymentId: candidatePayment.id,
          gatewayOrderId: candidatePayment.gatewayOrderId,
          status: providerStatus,
          paymentStatus: order.paymentStatus,
          reconciled: false,
          message: 'Provider reports that this payment has been refunded or partially refunded.',
        };
      }

      if (providerPayment.status === 'captured') {
        await db.$transaction([
          db.payment.update({
            where: { id: candidatePayment.id },
            data: { status: 'CAPTURED' },
          }),
          db.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'CAPTURED' },
          }),
        ]);

        await dispatchPaidOrderToAgents(order.id);

        return {
          orderId: order.id,
          paymentId: candidatePayment.id,
          gatewayOrderId: candidatePayment.gatewayOrderId,
          status: 'CAPTURED',
          paymentStatus: 'CAPTURED',
          reconciled: true,
        };
      }
    } catch (err) {
      console.warn('[RECONCILE] Provider lookup by payment ID failed:', { errorType: err instanceof Error ? err.name : 'UnknownError' });
    }
  }

  // 2. If we have a gatewayOrderId, check if any payment was captured under this order on Razorpay
  if (candidatePayment.gatewayOrderId) {
    try {
      const paymentsList = await fetchRazorpayOrderPayments(
        candidatePayment.gatewayOrderId
      );

      const capturedItem = paymentsList.items?.find(
        (p) =>
          p.status === 'captured' &&
          p.refund_status !== 'full' &&
          p.refund_status !== 'partial' &&
          !(
            typeof p.amount_refunded === 'number' &&
            p.amount_refunded > 0
          )
      );

      if (capturedItem) {
        await db.$transaction([
          db.payment.update({
            where: { id: candidatePayment.id },
            data: {
              paymentId: capturedItem.id,
              status: 'CAPTURED',
            },
          }),
          db.order.update({
            where: { id: order.id },
            data: { paymentStatus: 'CAPTURED' },
          }),
        ]);

        await dispatchPaidOrderToAgents(order.id);

        return {
          orderId: order.id,
          paymentId: capturedItem.id,
          gatewayOrderId: candidatePayment.gatewayOrderId,
          status: 'CAPTURED',
          paymentStatus: 'CAPTURED',
          reconciled: true,
        };
      }
    } catch (err) {
      console.warn('[RECONCILE] Provider lookup by gateway order failed:', {
        errorType: err instanceof Error ? err.name : 'UnknownError',
      });
    }
  }

  return {
    orderId: order.id,
    paymentId: candidatePayment.id,
    gatewayOrderId: candidatePayment.gatewayOrderId,
    status: candidatePayment.status,
    paymentStatus: order.paymentStatus,
    reconciled: false,
  };
}
