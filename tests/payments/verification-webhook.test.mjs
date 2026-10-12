import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import { isOrderPaymentGateSatisfied } from '../../lib/payments/policy.ts';
import { recordProviderPaymentStatus } from '../../lib/payments/recordStatus.ts';
import { verifyRazorpayHmacSignature, verifyRazorpayWebhookSignature } from '../../lib/payments/razorpay.ts';
import { processRazorpayWebhook } from '../../lib/payments/webhook.ts';
import { PaymentVerificationError, verifyAndRecordPaymentCore } from '../../lib/payments/verificationCore.ts';

const secret = 'offline-test-secret';
const orderId = 'order-local-1';
const gatewayOrderId = 'rzp-order-1';
const providerPaymentId = 'pay-1';

function makeStore({ paymentStatus = 'PENDING', status = 'PENDING', orderStatus = 'BOOKING_RECEIVED', paymentId = null, otherPayments = [] } = {}) {
  const order = { id: orderId, customerId: 'customer-1', paymentStatus, status: orderStatus, financialDirection: 'CUSTOMER_PAYS' };
  const payment = {
    id: 'payment-local-1', orderId, amount: 156, direction: 'CUSTOMER_PAYS', gateway: 'RAZORPAY',
    gatewayOrderId, paymentId, status, order,
  };
  const payments = [payment, ...otherPayments];
  let transactionChain = Promise.resolve();
  const matches = (value, condition) => {
    if (condition === undefined) return true;
    if (condition && typeof condition === 'object' && 'not' in condition) return value !== condition.not;
    if (condition && typeof condition === 'object' && 'in' in condition) return condition.in.includes(value);
    if (condition && typeof condition === 'object' && 'notIn' in condition) return !condition.notIn.includes(value);
    return value === condition;
  };
  const store = {
    payment: {
      async findFirst({ where }) {
        return payments.find((item) => Object.entries(where).every(([key, value]) => matches(item[key], value))) || null;
      },
      async findUnique({ where, include }) {
        const found = payments.find((item) => item.id === where.id);
        if (!found) return null;
        return include?.order ? { ...found, order: found.order } : found;
      },
      async updateMany({ where, data }) {
        const found = payments.find((item) => item.id === where.id && matches(item.status, where.status));
        if (!found) return { count: 0 };
        Object.assign(found, data);
        return { count: 1 };
      },
    },
    order: {
      async updateMany({ where, data }) {
        if (order.id !== where.id || !matches(order.paymentStatus, where.paymentStatus)) return { count: 0 };
        Object.assign(order, data);
        return { count: 1 };
      },
      async findUnique({ where }) {
        return where.id === order.id ? order : null;
      },
    },
    async $transaction(callback, options) {
      assert.equal(options?.isolationLevel, 'Serializable');
      let release;
      const previous = transactionChain;
      transactionChain = new Promise((resolve) => { release = resolve; });
      await previous;
      try { return await callback(store); } finally { release(); }
    },
    snapshot() { return { order: { ...order }, payment: { ...payment } }; },
  };
  return store;
}

function verificationDependencies(store, providerOverrides = {}, counters = {}) {
  return {
    store,
    verifySignature: () => counters.signatureValid !== false,
    fetchPayment: async () => {
      counters.fetches = (counters.fetches || 0) + 1;
      return {
        id: providerPaymentId,
        order_id: gatewayOrderId,
        amount: 15_600,
        currency: 'INR',
        status: 'captured',
        ...providerOverrides,
      };
    },
    dispatchPaidOrder: async () => { counters.dispatches = (counters.dispatches || 0) + 1; },
  };
}

function webhookEvent(event, entityOverrides = {}) {
  return JSON.stringify({
    event,
    payload: { payment: { entity: {
      id: providerPaymentId,
      order_id: gatewayOrderId,
      amount: 15_600,
      currency: 'INR',
      status: event.split('.')[1],
      ...entityOverrides,
    } } },
  });
}

function webhookDependencies(store, valid = true) {
  return { store, verifySignature: () => valid };
}

test('Razorpay HMAC verification accepts the correct digest and rejects malformed or invalid signatures', () => {
  const payload = 'order-1|payment-1';
  const valid = createHmac('sha256', secret).update(payload).digest('hex');
  assert.equal(verifyRazorpayHmacSignature(payload, valid, secret), true);
  assert.equal(verifyRazorpayHmacSignature(payload, `${valid.slice(0, -1)}0`, secret), false);
  assert.equal(verifyRazorpayHmacSignature(payload, 'not-a-signature', secret), false);
});

test('webhook signature uses the configured webhook secret and exact raw body', () => {
  const previous = process.env.RAZORPAY_WEBHOOK_SECRET;
  const rawBody = '{ "event" : "payment.ignored" }';
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  process.env.RAZORPAY_WEBHOOK_SECRET = secret;
  try {
    assert.equal(verifyRazorpayWebhookSignature(rawBody, signature), true);
    assert.equal(verifyRazorpayWebhookSignature(JSON.stringify(JSON.parse(rawBody)), signature), false);
  } finally {
    if (previous === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = previous;
  }
});

test('verification rejects invalid signature before provider lookup or writes', async () => {
  const store = makeStore();
  const counters = { signatureValid: false };
  await assert.rejects(
    verifyAndRecordPaymentCore({ orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'x' }, verificationDependencies(store, {}, counters)),
    (error) => error instanceof PaymentVerificationError && error.statusCode === 400
  );
  assert.equal(counters.fetches || 0, 0);
  assert.equal(store.snapshot().payment.status, 'PENDING');
});

test('provider lookup failures do not create captured payment state', async () => {
  const store = makeStore();
  const deps = verificationDependencies(store);
  deps.fetchPayment = async () => { throw new Error('offline provider failure'); };
  await assert.rejects(
    verifyAndRecordPaymentCore(
      { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' },
      deps
    ),
    (error) => error instanceof PaymentVerificationError && error.statusCode === 502
  );
  assert.equal(store.snapshot().payment.status, 'PENDING');
  assert.equal(store.snapshot().order.paymentStatus, 'PENDING');
});

for (const [label, providerOverrides] of [
  ['payment ID', { id: 'pay-other' }],
  ['gateway order ID', { order_id: 'rzp-other-order' }],
  ['amount', { amount: 15_599 }],
  ['currency', { currency: 'USD' }],
]) {
  test(`verification rejects mismatched provider ${label}`, async () => {
    const store = makeStore();
    await assert.rejects(
      verifyAndRecordPaymentCore(
        { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' },
        verificationDependencies(store, providerOverrides)
      ),
      (error) => error instanceof PaymentVerificationError && error.statusCode === 400
    );
    assert.equal(store.snapshot().payment.status, 'PENDING');
    assert.equal(store.snapshot().order.paymentStatus, 'PENDING');
  });
}

test('authorized payment does not satisfy the customer payment gate; captured does', async () => {
  const store = makeStore();
  const authorized = await verifyAndRecordPaymentCore(
    { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' },
    verificationDependencies(store, { status: 'authorized' })
  );
  assert.equal(authorized.status, 'AUTHORIZED');
  assert.equal(isOrderPaymentGateSatisfied({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: authorized.status }), false);

  const capturedStore = makeStore();
  const captured = await verifyAndRecordPaymentCore(
    { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' },
    verificationDependencies(capturedStore)
  );
  assert.equal(captured.status, 'CAPTURED');
  assert.equal(isOrderPaymentGateSatisfied({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: captured.status }), true);
});

test('duplicate callback is idempotent and dispatches only once', async () => {
  const store = makeStore();
  const counters = {};
  const deps = verificationDependencies(store, {}, counters);
  const input = { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' };
  await verifyAndRecordPaymentCore(input, deps);
  const duplicate = await verifyAndRecordPaymentCore(input, deps);
  assert.equal(duplicate.status, 'CAPTURED');
  assert.equal(counters.fetches, 1);
  assert.equal(counters.dispatches, 1);
});

test('late provider capture on a cancelled order records refund review and never dispatches', async () => {
  const store = makeStore({ orderStatus: 'CANCELLED' });
  const counters = {};
  const result = await verifyAndRecordPaymentCore(
    { orderId, razorpayOrderId: gatewayOrderId, razorpayPaymentId: providerPaymentId, razorpaySignature: 'signed' },
    verificationDependencies(store, {}, counters)
  );
  assert.equal(result.status, 'CAPTURED');
  assert.equal(store.snapshot().payment.status, 'CAPTURED');
  assert.equal(store.snapshot().order.paymentStatus, 'REFUND_REQUIRED');
  assert.equal(counters.dispatches || 0, 0);
});

test('payment ID cannot be reused by another local payment record', async () => {
  const store = makeStore({ otherPayments: [{ id: 'payment-local-other-order', orderId: 'order-local-2', paymentId: providerPaymentId, status: 'CAPTURED' }] });
  await assert.rejects(
    recordProviderPaymentStatus({ store, localPaymentId: 'payment-local-1', providerPaymentId, status: 'CAPTURED' }),
    /already been used/
  );
  assert.equal(store.snapshot().payment.status, 'PENDING');
});

test('webhook uses verified raw body, rejects mismatched details, and is idempotent', async () => {
  const store = makeStore();
  await assert.rejects(
    processRazorpayWebhook(webhookEvent('payment.captured'), 'bad', webhookDependencies(store, false)),
    /Invalid webhook signature/
  );
  await assert.rejects(
    processRazorpayWebhook(webhookEvent('payment.captured', { amount: 1 }), 'signed', webhookDependencies(store)),
    /amount does not match/
  );
  await assert.rejects(
    processRazorpayWebhook(webhookEvent('payment.captured', { currency: 'USD' }), 'signed', webhookDependencies(store)),
    /details are invalid/
  );
  const raw = webhookEvent('payment.captured');
  const first = await processRazorpayWebhook(raw, 'signed', webhookDependencies(store));
  const duplicate = await processRazorpayWebhook(raw, 'signed', webhookDependencies(store));
  assert.equal(first.paymentStatus, 'CAPTURED');
  assert.equal(duplicate.status, 'Already processed');
  assert.equal(store.snapshot().payment.status, 'CAPTURED');
});

test('out-of-order failed or authorized webhook cannot regress captured, authorized, or refunded state', async () => {
  const capturedStore = makeStore();
  await processRazorpayWebhook(webhookEvent('payment.captured'), 'signed', webhookDependencies(capturedStore));
  await processRazorpayWebhook(webhookEvent('payment.failed'), 'signed', webhookDependencies(capturedStore));
  assert.equal(capturedStore.snapshot().payment.status, 'CAPTURED');
  assert.equal(capturedStore.snapshot().order.paymentStatus, 'CAPTURED');

  const authorizedStore = makeStore({ status: 'AUTHORIZED', paymentStatus: 'AUTHORIZED', paymentId: providerPaymentId });
  await processRazorpayWebhook(webhookEvent('payment.failed'), 'signed', webhookDependencies(authorizedStore));
  assert.equal(authorizedStore.snapshot().payment.status, 'AUTHORIZED');

  const refundedStore = makeStore({ status: 'REFUNDED', paymentStatus: 'REFUNDED', paymentId: providerPaymentId });
  await processRazorpayWebhook(webhookEvent('payment.captured'), 'signed', webhookDependencies(refundedStore));
  assert.equal(refundedStore.snapshot().payment.status, 'REFUNDED');
  assert.equal(refundedStore.snapshot().order.paymentStatus, 'REFUNDED');
});

test('concurrent captured and failed webhook deliveries leave the payment captured', async () => {
  const store = makeStore();
  const results = await Promise.all([
    processRazorpayWebhook(webhookEvent('payment.captured'), 'signed', webhookDependencies(store)),
    processRazorpayWebhook(webhookEvent('payment.failed'), 'signed', webhookDependencies(store)),
  ]);
  assert.equal(results.length, 2);
  assert.equal(store.snapshot().payment.status, 'CAPTURED');
  assert.equal(store.snapshot().order.paymentStatus, 'CAPTURED');
});
