import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  payment: null as any,
  gatewayCalls: 0,
  broadcasts: 0,
  failOrderUpdate: false,
  transactionTail: Promise.resolve(),
  dispatchOrder: null as any,
  notificationJobs: new Map<string, any>(),
  pickupMessages: [] as any[],
  paymentStatus: 'PENDING',
  failPaymentLock: false,
  paymentLockQueries: [] as string[],
  broadcastEvents: [] as Array<{ event: string; payload: any }>,
  failPickupSend: false,
  forcedSelections: [] as string[],
  forceNoPriorReads: 0,
};

const order = {
  id: 'order-1',
  customerId: 'customer-1',
  financialDirection: 'CUSTOMER_PAYS',
  status: 'BOOKING_RECEIVED',
  finalAmount: 125,
  orderNumber: 'JIO-001',
  createdAt: new Date('2026-10-23T10:00:00.000Z'),
};

const capturedPayment = {
  id: 'payment-1',
  orderId: order.id,
  amount: 125,
  direction: 'CUSTOMER_PAYS',
  gateway: 'RAZORPAY',
  gatewayOrderId: 'order_rzp_1',
  paymentId: null,
  signature: null,
  status: 'INITIATED',
};

vi.mock('@/lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => ({
    userId: 'customer-user',
    customerId: 'customer-1',
    phone: '9999999999',
    role: 'CUSTOMER',
  })),
}));

vi.mock('@/lib/payments/razorpay', () => ({
  createRazorpayOrder: vi.fn(async () => {
    state.gatewayCalls += 1;
    return {
      id: 'order_rzp_1',
      amount: 12500,
      currency: 'INR',
      keyId: 'rzp_test_key',
    };
  }),
  fetchRazorpayPayment: vi.fn(async () => ({
    id: 'pay_1',
    order_id: 'order_rzp_1',
    amount: 12500,
    currency: 'INR',
    status: 'captured',
  })),
  verifyRazorpayPaymentSignature: vi.fn(() => true),
  verifyRazorpayWebhookSignature: vi.fn(() => true),
  RazorpayOrderCreationError: class extends Error {
    uncertain = false;
  },
}));

vi.mock('@/lib/services/agentService', () => ({
  findEligibleAgentsForServiceArea: vi.fn(async () => [
    { id: 'agent-1', userId: 'agent-user-1', status: 'AVAILABLE', user: { phone: '9000000001' }, locations: [{ lat: 12.9, lng: 77.6, timestamp: new Date() }] },
    { id: 'agent-2', userId: 'agent-user-2', status: 'AVAILABLE', user: { phone: '9000000002' }, locations: [{ lat: 12.91, lng: 77.6, timestamp: new Date() }] },
  ]),
  selectNearestEligibleAgent: vi.fn((agents: any[]) => {
    const forcedAgentId = state.forcedSelections.shift();
    return agents.find((agent) => agent.id === forcedAgentId) || agents[0] || null;
  }),
}));

vi.mock('@/lib/services/whatsappService', () => ({
  sendAgentPickupOffer: vi.fn(async (message: any) => {
    state.pickupMessages.push(message);
    return state.failPickupSend
      ? { success: false }
      : { success: true, requestId: 'mock-provider-request' };
  }),
}));

vi.mock('@/lib/realtime', () => ({
  broadcaster: {
    broadcast: vi.fn((event: string, payload: any) => {
      state.broadcasts += 1;
      state.broadcastEvents.push({ event, payload });
    }),
  },
}));

vi.mock('@/lib/db', () => {
  const payment = {
    findFirst: vi.fn(async ({ where }: any) => {
      if (where.paymentId) return null;
      if (!state.payment) return null;
      if (
        where.status?.in &&
        !where.status.in.includes(state.payment.status)
      ) {
        return null;
      }
      return { ...state.payment, order: { ...order } };
    }),
    findUnique: vi.fn(async () => (state.payment ? { ...state.payment } : null)),
    create: vi.fn(async ({ data }: any) => {
      state.payment = {
        id: 'payment-1',
        ...data,
      };
      return { ...state.payment };
    }),
    update: vi.fn(async ({ data }: any) => {
      state.payment = { ...state.payment, ...data };
      return { ...state.payment };
    }),
    updateMany: vi.fn(async ({ data }: any) => {
      if (!state.payment || !['INITIATED', 'AUTHORIZED'].includes(state.payment.status)) {
        return { count: 0 };
      }
      state.payment = { ...state.payment, ...data };
      return { count: 1 };
    }),
  };

  const database = {
    order: {
      findUnique: vi.fn(async () => state.dispatchOrder || ({
        ...order,
        paymentStatus: state.paymentStatus,
        address: { area: 'JP Nagar', lat: 12.9, lng: 77.6, street: 'Cross Road', pincode: '560078' },
        items: [{ estimatedWeight: 5 }],
      })),
      update: vi.fn(async ({ data }: any) => {
        if (state.failOrderUpdate) {
          state.failOrderUpdate = false;
          throw new Error('simulated order update failure');
        }
        state.paymentStatus = data.paymentStatus;
        return { ...order, paymentStatus: state.paymentStatus };
      }),
    },
    payment,
    notification: {
      findFirst: vi.fn(async ({ where }: any) => {
        if (state.forceNoPriorReads > 0) {
          state.forceNoPriorReads -= 1;
          return null;
        }
        const existing = [...state.notificationJobs.values()].find((job) =>
          job.orderId === where.orderId && job.type === where.type && job.provider === where.provider,
        );
        return existing ? { id: existing.id, userId: existing.userId, recipient: existing.recipient } : null;
      }),
      findUnique: vi.fn(async ({ where }: any) => state.notificationJobs.get(where.id) || null),
      createMany: vi.fn(async ({ data }: any) => {
        let count = 0;
        for (const item of data) {
          if (state.notificationJobs.has(item.id)) continue;
          state.notificationJobs.set(item.id, { ...item });
          count += 1;
        }
        return { count };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const job = state.notificationJobs.get(where.id);
        if (!job) return { count: 0 };
        const claimable = where.OR?.some((condition: any) =>
          condition.status?.in?.includes(job.status) ||
          (condition.status === 'SENDING' && job.status === 'SENDING' &&
            condition.sentAt?.lt instanceof Date && job.sentAt instanceof Date &&
            job.sentAt < condition.sentAt.lt),
        );
        if (where.status === 'SENDING' && job.status !== 'SENDING') return { count: 0 };
        if (where.OR && !claimable) return { count: 0 };
        Object.assign(job, data);
        return { count: 1 };
      }),
    },
    $transaction: vi.fn(async (callback: any) => {
      if (Array.isArray(callback)) {
        return Promise.all(callback);
      }
      const snapshot = state.payment && { ...state.payment };
      const paymentStatusSnapshot = state.paymentStatus;
      let release!: () => void;
      const previous = state.transactionTail;
      state.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({
          $queryRaw: vi.fn(async (strings: TemplateStringsArray) => {
            state.paymentLockQueries.push(strings.join('?'));
            if (state.failPaymentLock) {
              const error = Object.assign(new Error('private database diagnostic'), {
                code: 'P2010',
                meta: { code: '42883', message: 'private SQL details and parameters' },
              });
              throw error;
            }
            return [];
          }),
          payment,
          order: database.order,
          notification: database.notification,
          agent: { update: vi.fn(async () => ({})) },
        });
      } catch (error) {
        state.payment = snapshot;
        state.paymentStatus = paymentStatusSnapshot;
        throw error;
      } finally {
        release();
      }
    }),
  };

  return { db: database };
});

import { POST as createPayment } from '../app/api/payments/create/route';
import { POST as verifyPayment } from '../app/api/payments/verify/route';
import { POST as paymentWebhook } from '../app/api/payments/webhook/route';
import { dispatchPaidOrderToAgents } from '@/lib/payments/verification';

function request(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.payment = null;
  state.gatewayCalls = 0;
  state.broadcasts = 0;
  state.failOrderUpdate = false;
  state.transactionTail = Promise.resolve();
  state.dispatchOrder = null;
  state.notificationJobs.clear();
  state.pickupMessages.length = 0;
  state.paymentStatus = 'PENDING';
  state.failPaymentLock = false;
  state.paymentLockQueries.length = 0;
  state.broadcastEvents.length = 0;
  state.failPickupSend = false;
  state.forcedSelections.length = 0;
  state.forceNoPriorReads = 0;
});

function makeDispatchOrder(agentId: string | null) {
  return {
    id: 'dispatch-order-1',
    orderNumber: 'JIO-DISPATCH-1',
    customerId: 'customer-1',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    status: agentId ? 'AGENT_ACCEPTED' : 'BOOKING_RECEIVED',
    agentId,
    agent: agentId ? { userId: 'assigned-user', user: { name: 'Assigned agent' } } : null,
    customer: { userId: 'customer-user' },
    createdAt: new Date('2026-10-23T10:00:00.000Z'),
    address: { area: 'JP Nagar', street: 'Cross Road', landmark: 'Park', pincode: '560078', lat: 12.9, lng: 77.6 },
    items: [{ estimatedWeight: 5 }],
  };
}

test.each([['preassigned', 'assigned-agent'], ['unassigned', null]] as const)(
  '%s captured orders follow the correct agent notification path on repeated dispatch',
  async (_description, agentId) => {
    state.dispatchOrder = makeDispatchOrder(agentId);

    await dispatchPaidOrderToAgents(state.dispatchOrder.id);
    await dispatchPaidOrderToAgents(state.dispatchOrder.id);

    const pickupJobs = [...state.notificationJobs.values()].filter((job) => job.provider === 'FAST2SMS');
    if (agentId) {
      assert.equal(pickupJobs.length, 0);
      assert.equal(state.pickupMessages.length, 0);
      assert.equal(
        [...state.notificationJobs.values()].filter((job) => job.type === 'AGENT_BOOKING_ASSIGNED').length,
        1,
      );
    } else {
      assert.equal(pickupJobs.length, 1);
      assert.equal(pickupJobs[0].recipient, '9000000001');
      assert.equal(state.pickupMessages.length, 1);
      assert.equal(state.broadcastEvents.length, 1);
      assert.equal(state.broadcastEvents[0].event, 'NEW_PICKUP_AVAILABLE');
      assert.deepEqual(state.broadcastEvents[0].payload.targetAgentIds, ['agent-1']);
      assert.equal(state.pickupMessages[0].agentPhone, '9000000001');
      assert.equal(state.pickupMessages[0].latitude, 12.9);
      assert.equal(state.pickupMessages[0].longitude, 77.6);
      assert.equal(state.pickupMessages[0].mapsLink, 'https://www.google.com/maps?q=12.9%2C77.6');
    }
  },
);

test('concurrent dispatches persist and offer to only the order-scoped winner', async () => {
  state.dispatchOrder = makeDispatchOrder(null);
  state.forceNoPriorReads = 2;
  state.forcedSelections = ['agent-1', 'agent-2'];

  await Promise.all([
    dispatchPaidOrderToAgents(state.dispatchOrder.id),
    dispatchPaidOrderToAgents(state.dispatchOrder.id),
  ]);

  const pickupJobs = [...state.notificationJobs.values()].filter((job) => job.type === 'AGENT_PICKUP_AVAILABLE');
  assert.equal(pickupJobs.length, 1);
  assert.equal(state.broadcastEvents.filter((event) => event.event === 'NEW_PICKUP_AVAILABLE').length, 1);
  const winner = pickupJobs[0];
  const winnerAgentId = winner.userId === 'agent-user-1' ? 'agent-1' : 'agent-2';
  assert.deepEqual(state.broadcastEvents[0].payload.targetAgentIds, [winnerAgentId]);
  assert.equal(state.pickupMessages.length, 1);
  assert.equal(state.pickupMessages[0].agentPhone, winner.recipient);
});

test('dispatch rejects unpaid, non-customer-paid and coordinate-less orders', async () => {
  const baseline = makeDispatchOrder(null);
  const invalidDispatchOrders = [
    { ...baseline, paymentStatus: 'PENDING' },
    { ...baseline, financialDirection: 'JUNKITOUT_PAYS' },
    { ...baseline, address: { ...baseline.address, lat: undefined, lng: undefined } },
    { ...baseline, address: { ...baseline.address, lat: 91 } },
  ];

  for (const dispatchOrder of invalidDispatchOrders) {
    state.dispatchOrder = dispatchOrder;
    await dispatchPaidOrderToAgents(dispatchOrder.id);
  }

  assert.equal(state.broadcastEvents.length, 0);
  assert.equal(state.notificationJobs.size, 0);
  assert.equal(state.pickupMessages.length, 0);
});

test('WhatsApp failure leaves the selected in-app offer available', async () => {
  state.dispatchOrder = makeDispatchOrder(null);
  state.failPickupSend = true;

  await dispatchPaidOrderToAgents(state.dispatchOrder.id);

  assert.equal(state.broadcastEvents.length, 1);
  assert.equal(state.broadcastEvents[0].event, 'NEW_PICKUP_AVAILABLE');
  assert.deepEqual(state.broadcastEvents[0].payload.targetAgentIds, ['agent-1']);
  assert.equal([...state.notificationJobs.values()][0]?.status, 'FAILED');
});

test('concurrent payment creation produces one active attempt and one gateway order', async () => {
  const responses = await Promise.all([
    createPayment(request('/api/payments/create', { orderId: order.id })),
    createPayment(request('/api/payments/create', { orderId: order.id })),
  ]);

  assert.equal(state.gatewayCalls, 1);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
  assert.equal(state.payment.status, 'INITIATED');
  assert.equal(state.payment.gatewayOrderId, 'order_rzp_1');
  assert.equal(state.paymentLockQueries.length, 2);
  assert.ok(state.paymentLockQueries.every((query) => query.includes('FOR UPDATE')));
});

test('a failed order-row lock leaves payment and order state unchanged', async () => {
  state.failPaymentLock = true;

  const response = await createPayment(request('/api/payments/create', { orderId: order.id }));

  assert.equal(response.status, 500);
  assert.equal(state.payment, null);
  assert.equal(state.paymentStatus, 'PENDING');
  assert.equal(state.gatewayCalls, 0);
  assert.match(state.paymentLockQueries[0] || '', /FOR UPDATE/);
});

test('failed local attempt can be retried without reusing failed history', async () => {
  const razorpay = await import('@/lib/payments/razorpay');
  vi.mocked(razorpay.createRazorpayOrder)
    .mockRejectedValueOnce(new Error('provider rejected request'))
    .mockResolvedValueOnce({
      id: 'order_rzp_2',
      amount: 12500,
      currency: 'INR',
      keyId: 'rzp_test_key',
    });

  const first = await createPayment(request('/api/payments/create', { orderId: order.id }));
  assert.equal(first.status, 500);
  assert.equal(state.payment.status, 'FAILED');

  const second = await createPayment(request('/api/payments/create', { orderId: order.id }));
  assert.equal(second.status, 200);
  assert.equal(state.payment.status, 'INITIATED');
  assert.equal(state.payment.gatewayOrderId, 'order_rzp_2');
});

test('concurrent verification records one capture and one fulfillment effect', async () => {
  state.payment = { ...capturedPayment, status: 'INITIATED' };

  const responses = await Promise.all([
    verifyPayment(request('/api/payments/verify', {
      orderId: order.id,
      razorpay_order_id: 'order_rzp_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'signature',
    })),
    verifyPayment(request('/api/payments/verify', {
      orderId: order.id,
      razorpay_order_id: 'order_rzp_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'signature',
    })),
  ]);

  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 200]);
  assert.equal(state.payment.status, 'CAPTURED');
  assert.equal(state.broadcasts, 1);
});

test('a failed verification transaction can be retried safely', async () => {
  state.payment = { ...capturedPayment, status: 'INITIATED' };
  state.failOrderUpdate = true;

  const first = await verifyPayment(request('/api/payments/verify', {
    orderId: order.id,
    razorpay_order_id: 'order_rzp_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: 'signature',
  }));
  assert.equal(first.status, 500);
  assert.equal(state.payment.status, 'INITIATED');
  assert.equal(state.broadcasts, 0);

  const second = await verifyPayment(request('/api/payments/verify', {
    orderId: order.id,
    razorpay_order_id: 'order_rzp_1',
    razorpay_payment_id: 'pay_1',
    razorpay_signature: 'signature',
  }));
  assert.equal(second.status, 200);
  assert.equal(state.payment.status, 'CAPTURED');
  assert.equal(state.broadcasts, 1);
});

test('duplicate captured webhook is acknowledged without duplicate state effects', async () => {
  state.payment = { ...capturedPayment, status: 'INITIATED' };
  const body = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_1',
          order_id: 'order_rzp_1',
          amount: 12500,
          currency: 'INR',
        },
      },
    },
  };

  const first = await paymentWebhook(request('/api/payments/webhook', body, {
    'x-razorpay-signature': 'valid',
  }));
  const second = await paymentWebhook(request('/api/payments/webhook', body, {
    'x-razorpay-signature': 'valid',
  }));

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(state.payment.status, 'CAPTURED');
});

test('webhook and client verification racing for one payment remain idempotent', async () => {
  state.payment = { ...capturedPayment, status: 'INITIATED' };
  const body = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: 'pay_1',
          order_id: 'order_rzp_1',
          amount: 12500,
          currency: 'INR',
        },
      },
    },
  };

  const [webhookResponse, verificationResponse] = await Promise.all([
    paymentWebhook(request('/api/payments/webhook', body, {
      'x-razorpay-signature': 'valid',
    })),
    verifyPayment(request('/api/payments/verify', {
      orderId: order.id,
      razorpay_order_id: 'order_rzp_1',
      razorpay_payment_id: 'pay_1',
      razorpay_signature: 'signature',
    })),
  ]);

  assert.equal(webhookResponse.status, 200);
  assert.equal(verificationResponse.status, 200);
  assert.equal(state.payment.status, 'CAPTURED');
});
