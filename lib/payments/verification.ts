import { db } from '@/lib/db';
import {
  fetchRazorpayPayment,
  verifyRazorpayPaymentSignature,
} from './razorpay';

import {
  findEligibleAgentsForServiceArea,
} from '@/lib/services/agentService';

import { broadcaster } from '@/lib/realtime';
import { verifyAndRecordPaymentCore } from './verificationCore';
export { PaymentVerificationError } from './verificationCore';

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
      order.paymentStatus !== 'CAPTURED' ||
      ['CANCELLED', 'PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED'].includes(order.status)
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

export async function verifyAndRecordPayment(input: {
  orderId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  customerId?: string | null;
}) {
  return verifyAndRecordPaymentCore(input, {
    store: db,
    verifySignature: verifyRazorpayPaymentSignature,
    fetchPayment: fetchRazorpayPayment,
    dispatchPaidOrder: dispatchPaidOrderToAgents,
  });
}
