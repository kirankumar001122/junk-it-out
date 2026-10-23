import assert from 'node:assert/strict';
import { beforeEach, test, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  payment: null as any,
  gatewayCalls: 0,
  broadcasts: 0,
  failOrderUpdate: false,
  transactionTail: Promise.resolve(),
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
  findEligibleAgentsForServiceArea: vi.fn(async () => [{
    id: 'agent-1',
    status: 'AVAILABLE',
  }]),
}));

vi.mock('@/lib/realtime', () => ({
  broadcaster: {
    broadcast: vi.fn(() => {
      state.broadcasts += 1;
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
      findUnique: vi.fn(async () => ({
        ...order,
        paymentStatus: state.payment?.status,
        address: { area: 'JP Nagar' },
        items: [{ estimatedWeight: 5 }],
      })),
      update: vi.fn(async () => {
        if (state.failOrderUpdate) {
          state.failOrderUpdate = false;
          throw new Error('simulated order update failure');
        }
        return { ...order, paymentStatus: state.payment?.status };
      }),
    },
    payment,
    $transaction: vi.fn(async (callback: any) => {
      if (Array.isArray(callback)) {
        return Promise.all(callback);
      }
      const snapshot = state.payment && { ...state.payment };
      let release!: () => void;
      const previous = state.transactionTail;
      state.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback({
          $queryRaw: vi.fn(async () => []),
          payment,
          order: database.order,
        });
      } catch (error) {
        state.payment = snapshot;
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
