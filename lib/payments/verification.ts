import { db } from '@/lib/db';
import {
  fetchRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from './razorpay';

import {
  findEligibleAgentsForServiceArea,
} from '@/lib/services/agentService';

import { broadcaster } from '@/lib/realtime';

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

async function dispatchPaidOrderToAgents(
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

        items: {
          select: {
            estimatedWeight: true,
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
    //
    // Even if this function is accidentally called from
    // somewhere else, an unpaid order will NOT be dispatched.
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
    // 5. GET SERVICE AREA
    // -------------------------------------------------------

    const targetServiceArea =
      order.address.area;

    // -------------------------------------------------------
    // 6. FIND ELIGIBLE AGENTS
    // -------------------------------------------------------

    const eligibleAgents =
      await findEligibleAgentsForServiceArea(
        targetServiceArea
      );

    // -------------------------------------------------------
    // 7. ONLY AVAILABLE AGENTS
    // -------------------------------------------------------

    const availableEligibleAgents =
      (eligibleAgents || []).filter(
        (agent: any) =>
          agent.status === 'AVAILABLE'
      );

    console.log(
      `[DISPATCH] Paid order #${order.orderNumber} for service area '${targetServiceArea}'. Available eligible agents count: ${availableEligibleAgents.length}`
    );

    // -------------------------------------------------------
    // 8. NO AVAILABLE AGENTS
    // -------------------------------------------------------

    if (
      availableEligibleAgents.length === 0
    ) {
      console.log(
        `[DISPATCH] No available eligible agents for paid order #${order.orderNumber}.`
      );

      return;
    }

    // -------------------------------------------------------
    // 9. GET AGENT IDS
    // -------------------------------------------------------

    const targetAgentIds =
      availableEligibleAgents.map(
        (agent: any) => agent.id
      );

    // -------------------------------------------------------
    // 10. CALCULATE TOTAL ESTIMATED WEIGHT
    // -------------------------------------------------------

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

    // -------------------------------------------------------
    // 11. CREATE REALTIME NOTIFICATION
    // -------------------------------------------------------

    const notificationPayload = {
      type: 'NEW_PICKUP_AVAILABLE',

      targetAgentIds,

      orderId: order.id,

      orderNumber:
        order.orderNumber,

      serviceArea:
        targetServiceArea,

      estimatedQuantity:
        `${estimatedTotalWeight.toFixed(1)} kg`,

      itemsSummary:
        `${order.items.length} category item(s)`,

      createdAt:
        order.createdAt.toISOString(),
    };

    // -------------------------------------------------------
    // 12. SEND TO AGENT PORTAL
    // -------------------------------------------------------

    broadcaster.broadcast(
      'NEW_PICKUP_AVAILABLE',
      notificationPayload
    );

    console.log(
      `[DISPATCH] NEW_PICKUP_AVAILABLE sent for paid order #${order.orderNumber}.`
    );
  } catch (error) {
    // -------------------------------------------------------
    // IMPORTANT:
    // Do NOT undo a successful payment just because the
    // realtime agent notification failed.
    // -------------------------------------------------------

    console.error(
      `[DISPATCH ERROR] Failed to notify agents for paid order ${orderId}:`,
      error
    );
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

  // -------------------------------------------------------
  // 5. ALREADY CAPTURED
  // -------------------------------------------------------

  if (
    payment.status === 'CAPTURED' &&
    payment.paymentId ===
      input.razorpayPaymentId
  ) {
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