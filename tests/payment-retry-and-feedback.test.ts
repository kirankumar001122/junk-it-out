import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const state = {
  payment: null as any,
  gatewayCalls: 0,
  broadcasts: 0,
  executeRawCalls: [] as any[],
  currentUser: {
    userId: 'customer-user-1',
    customerId: 'customer-1',
    phone: '9876543210',
    role: 'CUSTOMER',
  } as any,
  transactionTail: Promise.resolve(),
};

const baseOrder = {
  id: 'order-retry-1',
  customerId: 'customer-1',
  financialDirection: 'CUSTOMER_PAYS',
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'INITIATED',
  finalAmount: 149,
  orderNumber: 'JIO-RETRY-001',
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  address: { area: 'JP Nagar' },
  items: [{ estimatedWeight: 5 }],
};

let currentOrder = { ...baseOrder };

vi.mock('@/lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => state.currentUser),
}));

vi.mock('@/lib/payments/razorpay', () => ({
  createRazorpayOrder: vi.fn(async () => {
    state.gatewayCalls += 1;
    return {
      id: `order_rzp_${state.gatewayCalls}`,
      amount: 14900,
      currency: 'INR',
      keyId: 'rzp_test_key_abc',
    };
  }),
  fetchRazorpayPayment: vi.fn(async () => ({
    id: 'pay_retry_1',
    order_id: 'order_rzp_1',
    amount: 14900,
    currency: 'INR',
    status: 'captured',
  })),
  verifyRazorpayPaymentSignature: vi.fn((_orderId: string, _paymentId: string, razorpaySignature: string) => {
    return razorpaySignature === 'valid_signature_123';
  }),
  verifyRazorpayWebhookSignature: vi.fn(() => true),
  RazorpayOrderCreationError: class extends Error {
    uncertain = false;
  },
}));

vi.mock('@/lib/services/agentService', () => ({
  findEligibleAgentsForServiceArea: vi.fn(async () => [
    { id: 'agent-1', status: 'AVAILABLE' },
  ]),
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
      if (where.status?.in && !where.status.in.includes(state.payment.status)) {
        return null;
      }
      return { ...state.payment, order: { ...currentOrder } };
    }),
    findUnique: vi.fn(async () => (state.payment ? { ...state.payment } : null)),
    create: vi.fn(async ({ data }: any) => {
      state.payment = {
        id: 'payment-retry-id',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return { ...state.payment };
    }),
    update: vi.fn(async ({ data }: any) => {
      state.payment = { ...state.payment, ...data, updatedAt: new Date() };
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

  const orderTable = {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id === currentOrder.id) {
        return {
          ...currentOrder,
          payments: state.payment ? [{ ...state.payment }] : [],
        };
      }
      return null;
    }),
    update: vi.fn(async ({ data }: any) => {
      currentOrder = { ...currentOrder, ...data };
      return { ...currentOrder };
    }),
  };

  const database = {
    order: orderTable,
    payment,
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
      state.executeRawCalls.push({ strings, values });
      return 1;
    }),
    $transaction: vi.fn(async (callback: any) => {
      let release = () => {};
      const previous = state.transactionTail;
      state.transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;

      const snapshot = state.payment ? { ...state.payment } : null;
      try {
        return await callback({
          $executeRaw: database.$executeRaw,
          $queryRaw: database.$queryRaw,
          order: orderTable,
          payment,
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

function createPostRequest(url: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Customer Payment Retry and Failed Booking Feedback', () => {
  beforeEach(() => {
    state.payment = null;
    state.gatewayCalls = 0;
    state.broadcasts = 0;
    state.executeRawCalls = [];
    state.currentUser = {
      userId: 'customer-user-1',
      customerId: 'customer-1',
      phone: '9876543210',
      role: 'CUSTOMER',
    };
    currentOrder = { ...baseOrder };
    state.transactionTail = Promise.resolve();
  });

  it('preserves the original order reference when creating payment and retrying payment', async () => {
    // 1. Initial payment creation
    const res1 = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.equal(body1.success, true);
    assert.equal(body1.data.gatewayOrderId, 'order_rzp_1');
    assert.equal(state.payment.orderId, currentOrder.id);

    // Customer cancels or dismisses checkout: order remains in DB with same ID
    assert.equal(currentOrder.id, 'order-retry-1');
    assert.equal(currentOrder.paymentStatus, 'INITIATED');

    // 2. Customer retries payment for the existing order
    // In our backend, the existing active payment for this order is reused safely
    const res2 = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.equal(body2.success, true);
    assert.equal(body2.data.gatewayOrderId, 'order_rzp_1');
    assert.equal(state.payment.orderId, currentOrder.id);
  });

  it('rejects payment creation for other customers orders (Ownership Protection)', async () => {
    // Switch to Customer 2
    state.currentUser = {
      userId: 'customer-user-2',
      customerId: 'customer-2',
      phone: '9123456789',
      role: 'CUSTOMER',
    };

    const res = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /not authorized to pay for this order/i);
  });

  it('rejects unauthenticated payment creation requests', async () => {
    state.currentUser = null;

    const res = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.success, false);
  });

  it('guards already-paid orders from duplicate charges during retry', async () => {
    // Mark order as CAPTURED
    currentOrder.paymentStatus = 'CAPTURED';

    const res = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.alreadyPaid, true);
    assert.match(body.message, /already been paid and verified/i);
    // No gateway calls made
    assert.equal(state.gatewayCalls, 0);
  });

  it('guards cancelled orders from payment attempts or retries', async () => {
    currentOrder.status = 'CANCELLED';

    const res = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /no longer payable/i);
  });

  it('never marks order as paid without valid server-side signature verification', async () => {
    // Setup active payment for currentOrder
    state.payment = {
      id: 'payment-retry-id',
      orderId: currentOrder.id,
      amount: 149,
      direction: 'CUSTOMER_PAYS',
      gateway: 'RAZORPAY',
      gatewayOrderId: 'order_rzp_1',
      status: 'INITIATED',
    };

    // Attempt verification with invalid signature
    const invalidVerifyRes = await verifyPayment(
      createPostRequest('/api/payments/verify', {
        orderId: currentOrder.id,
        razorpay_order_id: 'order_rzp_1',
        razorpay_payment_id: 'pay_retry_1',
        razorpay_signature: 'tampered_or_invalid_signature',
      })
    );
    assert.equal(invalidVerifyRes.status, 400);
    const invalidBody = await invalidVerifyRes.json();
    assert.equal(invalidBody.success, false);
    // Order must remain uncaptured
    assert.notEqual(currentOrder.paymentStatus, 'CAPTURED');

    // Attempt verification with valid signature
    const validVerifyRes = await verifyPayment(
      createPostRequest('/api/payments/verify', {
        orderId: currentOrder.id,
        razorpay_order_id: 'order_rzp_1',
        razorpay_payment_id: 'pay_retry_1',
        razorpay_signature: 'valid_signature_123',
      })
    );
    assert.equal(validVerifyRes.status, 200);
    const validBody = await validVerifyRes.json();
    assert.equal(validBody.success, true);
    assert.equal(state.payment.status, 'CAPTURED');
  });

  it('rejects payment verification by unauthorized customer', async () => {
    // Setup active payment for Customer 1's order
    state.payment = {
      id: 'payment-retry-id',
      orderId: currentOrder.id,
      amount: 149,
      direction: 'CUSTOMER_PAYS',
      gateway: 'RAZORPAY',
      gatewayOrderId: 'order_rzp_1',
      status: 'INITIATED',
    };

    // Customer 2 attempts to verify payment for Customer 1's order
    state.currentUser = {
      userId: 'customer-user-2',
      customerId: 'customer-2',
      phone: '9123456789',
      role: 'CUSTOMER',
    };

    const res = await verifyPayment(
      createPostRequest('/api/payments/verify', {
        orderId: currentOrder.id,
        razorpay_order_id: 'order_rzp_1',
        razorpay_payment_id: 'pay_retry_1',
        razorpay_signature: 'valid_signature_123',
      })
    );
    // verification.ts checks customerId === order.customerId and returns 403
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.equal(body.success, false);
    assert.match(body.message, /not authorized to verify this payment/i);
  });

  it('acquires transaction-scoped advisory lock using $executeRaw on payment creation and retry', async () => {
    // 1. Initial attempt
    const res1 = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res1.status, 200);
    assert.equal(state.executeRawCalls.length, 1);
    const [call1] = state.executeRawCalls;
    const rawSql1 = call1.strings.join('?');
    assert.match(rawSql1, /pg_advisory_xact_lock/);
    assert.match(rawSql1, /hashtextextended/);
    assert.deepEqual(call1.values, [currentOrder.id]);

    // 2. Retry attempt for same order
    const res2 = await createPayment(
      createPostRequest('/api/payments/create', { orderId: currentOrder.id })
    );
    assert.equal(res2.status, 200);
    assert.equal(state.executeRawCalls.length, 2);
    const call2 = state.executeRawCalls[1];
    const rawSql2 = call2.strings.join('?');
    assert.match(rawSql2, /pg_advisory_xact_lock/);
    assert.match(rawSql2, /hashtextextended/);
    assert.deepEqual(call2.values, [currentOrder.id]);
    // Payment retry reuses existing active gateway order without creating new one
    assert.equal(state.gatewayCalls, 1);
  });
});
