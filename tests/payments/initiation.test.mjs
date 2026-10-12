import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initiateCustomerPayment, PaymentInitiationError } from '../../lib/payments/initiation.ts';

const CUSTOMER_ID = 'customer-1';
const ORDER_ID = 'order-1';
const NOW = Date.parse('2026-01-01T00:00:00.000Z');

function makePayment(overrides = {}) {
  return {
    id: 'payment-1',
    orderId: ORDER_ID,
    direction: 'CUSTOMER_PAYS',
    amount: 156,
    gateway: 'RAZORPAY',
    gatewayOrderId: null,
    status: 'PENDING',
    createdAt: new Date(NOW),
    ...overrides,
  };
}

function makeStore({ orderStatus = 'PENDING', payments = [], updatedAt = NOW } = {}) {
  const order = {
    id: ORDER_ID,
    customerId: CUSTOMER_ID,
    orderNumber: 'JIO-ORDER-1',
    status: 'BOOKING_RECEIVED',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: orderStatus,
    finalAmount: 156,
    updatedAt: new Date(updatedAt),
    payments,
  };

  const matches = (actual, condition) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === 'object' && 'in' in condition) return condition.in.includes(actual);
    if (condition && typeof condition === 'object' && 'notIn' in condition) return !condition.notIn.includes(actual);
    if (condition && typeof condition === 'object' && 'lte' in condition) return actual <= condition.lte;
    return actual === condition;
  };

  const store = {
    order: {
      async findUnique() {
        return { ...order, payments: order.payments.map((payment) => ({ ...payment })) };
      },
      async updateMany({ where, data }) {
        if (
          where.id !== order.id ||
          !matches(order.customerId, where.customerId) ||
          !matches(order.financialDirection, where.financialDirection) ||
          !matches(order.status, where.status) ||
          !matches(order.paymentStatus, where.paymentStatus) ||
          !matches(order.updatedAt, where.updatedAt)
        ) return { count: 0 };
        Object.assign(order, data, { updatedAt: new Date(NOW) });
        return { count: 1 };
      },
    },
    payment: {
      async updateMany({ where, data }) {
        const payment = order.payments.find((item) =>
          item.id === where.id && matches(item.status, where.status)
        );
        if (!payment) return { count: 0 };
        Object.assign(payment, data);
        return { count: 1 };
      },
      async create({ data }) {
        const payment = makePayment({ id: `payment-${order.payments.length + 1}`, ...data });
        order.payments.unshift(payment);
        return { ...payment };
      },
    },
    async $transaction(callback) {
      return callback(store);
    },
    snapshot() {
      return { ...order, payments: order.payments.map((payment) => ({ ...payment })) };
    },
  };

  return store;
}

function dependencies(store, onCreate = async () => ({
  id: 'rzp-order-1',
  amount: 15_600,
  currency: 'INR',
  keyId: 'rzp_test_key',
})) {
  return {
    store,
    createGatewayOrder: onCreate,
    getKeyId: () => 'rzp_test_key',
    now: () => NOW,
  };
}

test('captured payments are rejected without creating a gateway order', async () => {
  const store = makeStore({
    orderStatus: 'CAPTURED',
    payments: [makePayment({ status: 'CAPTURED', gatewayOrderId: 'rzp-existing' })],
  });
  let created = 0;

  await assert.rejects(
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(store, async () => {
      created += 1;
      throw new Error('must not reach provider');
    })),
    (error) => error instanceof PaymentInitiationError && error.statusCode === 409
  );
  assert.equal(created, 0);
});

test('ownership, payment direction, and authorization state are enforced', async () => {
  const ownerStore = makeStore();
  await assert.rejects(
    initiateCustomerPayment(ORDER_ID, 'another-customer', dependencies(ownerStore)),
    (error) => error instanceof PaymentInitiationError && error.statusCode === 403
  );

  const junkItOutPaysStore = makeStore();
  junkItOutPaysStore.order.findUnique = async () => ({
    ...junkItOutPaysStore.snapshot(),
    financialDirection: 'JUNKITOUT_PAYS',
  });
  await assert.rejects(
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(junkItOutPaysStore)),
    (error) => error instanceof PaymentInitiationError && error.statusCode === 400
  );

  const authorizedStore = makeStore({
    orderStatus: 'AUTHORIZED',
    payments: [makePayment({ status: 'AUTHORIZED', gatewayOrderId: 'rzp-authorized' })],
  });
  await assert.rejects(
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(authorizedStore)),
    (error) => error instanceof PaymentInitiationError && error.statusCode === 409
  );
});

test('repeated initiation reuses the same provider order', async () => {
  const store = makeStore();
  let created = 0;
  const deps = dependencies(store, async () => {
    created += 1;
    return { id: 'rzp-order-one', amount: 15_600, currency: 'INR', keyId: 'rzp_test_key' };
  });

  const first = await initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, deps);
  const second = await initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, deps);

  assert.equal(first.gatewayOrderId, 'rzp-order-one');
  assert.equal(second.gatewayOrderId, first.gatewayOrderId);
  assert.equal(second.paymentId, first.paymentId);
  assert.equal(created, 1);
  assert.equal(store.snapshot().payments.length, 1);
});

test('concurrent initiation requests claim the order once', async () => {
  const store = makeStore();
  let created = 0;
  const deps = dependencies(store, async () => {
    created += 1;
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { id: 'rzp-concurrent-order', amount: 15_600, currency: 'INR', keyId: 'rzp_test_key' };
  });

  const results = await Promise.allSettled([
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, deps),
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, deps),
  ]);

  assert.equal(created, 1);
  assert.equal(store.snapshot().payments.length, 1);
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
  const rejected = results.find((result) => result.status === 'rejected');
  assert.ok(rejected.reason instanceof PaymentInitiationError);
  assert.equal(rejected.reason.statusCode, 409);
});

test('failed payment retry reuses its existing provider order', async () => {
  const store = makeStore({
    orderStatus: 'FAILED',
    payments: [makePayment({ status: 'FAILED', gatewayOrderId: 'rzp-retry-same-order' })],
  });
  let created = 0;

  const result = await initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(store, async () => {
    created += 1;
    throw new Error('retry must reuse the prior provider order');
  }));

  assert.equal(result.gatewayOrderId, 'rzp-retry-same-order');
  assert.equal(created, 0);
  assert.equal(store.snapshot().payments[0].status, 'INITIATED');
  assert.equal(store.snapshot().paymentStatus, 'INITIATED');
});

test('expired payment attempt retries against its existing provider order', async () => {
  const store = makeStore({
    orderStatus: 'EXPIRED',
    payments: [makePayment({ status: 'EXPIRED', gatewayOrderId: 'rzp-expired-attempt-order' })],
  });
  let created = 0;

  const result = await initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(store, async () => {
    created += 1;
    throw new Error('expired attempt retry must reuse its order');
  }));

  assert.equal(result.gatewayOrderId, 'rzp-expired-attempt-order');
  assert.equal(created, 0);
  assert.equal(store.snapshot().payments[0].status, 'INITIATED');
  assert.equal(store.snapshot().paymentStatus, 'INITIATED');
});

test('stale server-side initiation reservation can be retried', async () => {
  const staleTime = NOW - 120_000;
  const store = makeStore({ orderStatus: 'INITIATING', updatedAt: staleTime });
  let created = 0;

  const result = await initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(store, async () => {
    created += 1;
    return { id: 'rzp-after-stale-reservation', amount: 15_600, currency: 'INR', keyId: 'rzp_test_key' };
  }));

  assert.equal(result.gatewayOrderId, 'rzp-after-stale-reservation');
  assert.equal(created, 1);
});

test('provider initiation failure leaves no payment row and releases the reservation as failed', async () => {
  const store = makeStore();
  await assert.rejects(
    initiateCustomerPayment(ORDER_ID, CUSTOMER_ID, dependencies(store, async () => {
      throw new Error('offline provider failure');
    })),
    /offline provider failure/
  );
  assert.equal(store.snapshot().paymentStatus, 'FAILED');
  assert.equal(store.snapshot().payments.length, 0);
});
