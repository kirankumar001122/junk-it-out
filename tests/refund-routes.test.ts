import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { EventEmitter } from 'node:events';
import https from 'node:https';
import { NextRequest } from 'next/server';
import { POST as adminRefundRoute } from '../app/api/admin/payments/refund/route';
import { GET as adminPaymentsRoute } from '../app/api/admin/payments/route';
import { POST as paymentWebhookRoute } from '../app/api/payments/webhook/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { refundAttemptId, refundIdempotencyKey } from '../lib/payments/refundWorkflow';
import { dispatchPaidOrderToAgents, reconcilePaymentForOrder } from '../lib/payments/verification';

// =========================================================================
// MOCK ENVIRONMENT SETUP
// =========================================================================
process.env.RAZORPAY_KEY_ID = 'rzp_test_mock_key';
process.env.RAZORPAY_KEY_SECRET = 'mock_secret_12345';
process.env.RAZORPAY_WEBHOOK_SECRET = 'webhook_secret_67890';

type MockPayment = {
  id: string;
  orderId: string;
  amount: number;
  direction: string;
  gateway: string;
  gatewayOrderId: string | null;
  paymentId: string | null;
  status: string;
};

type MockOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  paymentStatus: string;
  status: string;
  financialDirection: string;
  payments: MockPayment[];
};

type MockAttempt = {
  id: string;
  orderId: string;
  paymentId: string;
  amount: number;
  status: string;
  razorpayRefundId: string | null;
  failureReason: string | null;
};

type MockAttemptEvent = {
  id: string;
  refundAttemptId: string;
  eventType: string;
  status: string | null;
  details: any;
};

// State stores
let paymentsStore: Map<string, MockPayment> = new Map();
let ordersStore: Map<string, MockOrder> = new Map();
let attemptsStore: Map<string, MockAttempt> = new Map();
let attemptEventsStore: Map<string, MockAttemptEvent> = new Map();

// Razorpay HTTP mocking
let razorpayHandler: (path: string, method: string, body: any) => { status: number; body: any } = () => ({
  status: 200,
  body: {},
});

const originalHttpsRequest = https.request;
(https as any).request = (options: any, callback?: (res: any) => void) => {
  const req = new EventEmitter() as any;
  let requestBody = '';
  req.write = (chunk: string | Buffer) => {
    requestBody += chunk ? chunk.toString() : '';
  };
  req.end = () => {
    const parsedBody = requestBody ? JSON.parse(requestBody) : {};
    const response = razorpayHandler(options.path || '', options.method || 'GET', parsedBody);
    const res = new EventEmitter() as any;
    res.statusCode = response.status;
    res.headers = { 'content-type': 'application/json' };
    if (callback) callback(res);
    process.nextTick(() => {
      res.emit('data', JSON.stringify(response.body));
      res.emit('end');
    });
  };
  req.destroy = () => {};
  return req;
};

// Prisma DB mocking
const originalTransaction = (db as any).$transaction;
const paymentDelegate = db.payment as any;
const orderDelegate = db.order as any;
const attemptDelegate = (db as any).refundAttempt;
const eventDelegate = (db as any).refundAttemptEvent;
const refundRequestDelegate = (db as any).refundRequest || ((db as any).refundRequest = {});
refundRequestDelegate.findFirst = async () => null;
refundRequestDelegate.findUnique = async () => null;
refundRequestDelegate.findMany = async () => [];
refundRequestDelegate.create = async () => ({ id: 'mock-refund-request' });
refundRequestDelegate.update = async () => ({ id: 'mock-refund-request' });

paymentDelegate.findUnique = async ({ where }: any) => {
  const p = paymentsStore.get(where.id);
  if (!p) return null;
  const o = ordersStore.get(p.orderId);
  return { ...p, order: o ? { ...o } : null };
};

paymentDelegate.findMany = async () => {
  return Array.from(paymentsStore.values()).map((p) => {
    const o = ordersStore.get(p.orderId);
    return {
      ...p,
      createdAt: new Date(),
      order: o ? {
        orderNumber: o.orderNumber,
        actualTotal: 0,
        paymentStatus: o.paymentStatus,
        customer: { user: { name: 'Customer' } },
        items: [],
      } : null,
    };
  });
};

paymentDelegate.findFirst = async ({ where }: any) => {
  for (const p of paymentsStore.values()) {
    if (where.id?.not && p.id === where.id.not) continue;
    if (where.direction && p.direction !== where.direction) continue;
    if (where.gateway && p.gateway !== where.gateway) continue;
    if (where.paymentId && p.paymentId !== where.paymentId) continue;
    if (where.gatewayOrderId && p.gatewayOrderId !== where.gatewayOrderId) continue;
    if (where.OR) {
      const match = where.OR.some((cond: any) =>
        (cond.id && p.id === cond.id) ||
        (cond.orderId && p.orderId === cond.orderId) ||
        (cond.paymentId && p.paymentId === cond.paymentId)
      );
      if (!match) continue;
    }
    const o = ordersStore.get(p.orderId);
    return { ...p, order: o ? { ...o } : null };
  }
  return null;
};

orderDelegate.findUnique = async ({ where }: any) => {
  const o = ordersStore.get(where.id);
  if (!o) return null;
  const payments = Array.from(paymentsStore.values()).filter((p) => p.orderId === o.id);
  return { ...o, payments };
};

orderDelegate.findFirst = async ({ where }: any = {}) => {
  for (const o of ordersStore.values()) {
    if (where?.id && o.id !== where.id) continue;
    if (where?.orderNumber && o.orderNumber !== where.orderNumber) continue;
    const payments = Array.from(paymentsStore.values()).filter((p) => p.orderId === o.id);
    return { ...o, payments };
  }
  return null;
};

orderDelegate.findMany = async () => {
  return Array.from(ordersStore.values()).map((o) => ({
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    finalAmount: 149,
    estimatedTotal: 149,
    financialDirection: o.financialDirection,
    actualTotal: 149,
    paymentStatus: o.paymentStatus,
    createdAt: new Date(),
    customer: { user: { name: 'Customer' } },
    items: [],
  }));
};

attemptDelegate.findUnique = async ({ where, include }: any) => {
  const a = attemptsStore.get(where.id);
  if (!a) return null;
  const res: any = { ...a };
  if (include?.events) {
    res.events = Array.from(attemptEventsStore.values()).filter((e) => e.refundAttemptId === a.id);
  }
  return res;
};

attemptDelegate.findFirst = async ({ where }: any = {}) => {
  for (const a of attemptsStore.values()) {
    if (where?.paymentId && a.paymentId !== where.paymentId) continue;
    if (where?.status?.in && !where.status.in.includes(a.status)) continue;
    if (where?.amount !== undefined && Math.round(Number(a.amount) * 100) !== Math.round(Number(where.amount) * 100)) continue;
    return { ...a };
  }
  return null;
};

attemptDelegate.findMany = async ({ where }: any = {}) => {
  const results: any[] = [];
  for (const a of attemptsStore.values()) {
    if (where?.paymentId) {
      if (typeof where.paymentId === 'string' && a.paymentId !== where.paymentId) continue;
      if (where.paymentId.in && !where.paymentId.in.includes(a.paymentId)) continue;
    }
    if (where?.status?.in && !where.status.in.includes(a.status)) continue;
    results.push({ ...a });
  }
  return results;
};

attemptDelegate.createMany = async ({ data }: any) => {
  let count = 0;
  for (const item of data) {
    if (!attemptsStore.has(item.id)) {
      attemptsStore.set(item.id, {
        id: item.id,
        orderId: item.orderId,
        paymentId: item.paymentId,
        amount: item.amount,
        status: item.status || 'PENDING',
        razorpayRefundId: item.razorpayRefundId || null,
        failureReason: item.failureReason || null,
      });
      count += 1;
    }
  }
  return { count };
};

attemptDelegate.updateMany = async ({ where, data }: any) => {
  let count = 0;
  for (const [id, a] of attemptsStore.entries()) {
    if (a.id !== where.id) continue;
    if (where.status?.in && !where.status.in.includes(a.status)) continue;
    attemptsStore.set(id, { ...a, ...data });
    count += 1;
  }
  return { count };
};

eventDelegate.createMany = async ({ data }: any) => {
  let count = 0;
  for (const item of data) {
    if (!attemptEventsStore.has(item.id)) {
      attemptEventsStore.set(item.id, item);
      count += 1;
    }
  }
  return { count };
};

paymentDelegate.update = async ({ where, data }: any) => {
  const p = paymentsStore.get(where.id);
  if (!p) throw new Error('Payment not found');
  const updated = { ...p, ...data };
  paymentsStore.set(where.id, updated);
  return updated;
};

orderDelegate.update = async ({ where, data }: any) => {
  const o = ordersStore.get(where.id);
  if (!o) throw new Error('Order not found');
  const updated = { ...o, ...data };
  ordersStore.set(where.id, updated);
  return updated;
};

(db as any).$transaction = async (input: any) => {
  if (Array.isArray(input)) {
    return Promise.all(input);
  }
  const tx = {
    payment: {
      update: async ({ where, data }: any) => {
        const p = paymentsStore.get(where.id);
        if (!p) throw new Error('Payment not found');
        const updated = { ...p, ...data };
        paymentsStore.set(where.id, updated);
        return updated;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [id, p] of paymentsStore.entries()) {
          if (p.id !== where.id) continue;
          if (where.status && typeof where.status === 'string' && p.status !== where.status) continue;
          if (where.status?.in && !where.status.in.includes(p.status)) continue;
          paymentsStore.set(id, { ...p, ...data });
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: any) => {
        const p = paymentsStore.get(where.id);
        return p ? { ...p } : null;
      },
    },
    order: {
      update: async ({ where, data }: any) => {
        const o = ordersStore.get(where.id);
        if (!o) throw new Error('Order not found');
        const updated = { ...o, ...data };
        ordersStore.set(where.id, updated);
        return updated;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [id, o] of ordersStore.entries()) {
          if (o.id !== where.id) continue;
          if (where.paymentStatus && typeof where.paymentStatus === 'string' && o.paymentStatus !== where.paymentStatus) continue;
          if (where.paymentStatus?.in && !where.paymentStatus.in.includes(o.paymentStatus)) continue;
          ordersStore.set(id, { ...o, ...data });
          count += 1;
        }
        return { count };
      },
      findUnique: async ({ where }: any) => {
        const o = ordersStore.get(where.id);
        return o ? { ...o } : null;
      },
    },
    refundAttempt: {
      create: async ({ data }: any) => {
        attemptsStore.set(data.id, {
          id: data.id,
          orderId: data.orderId,
          paymentId: data.paymentId,
          amount: data.amount,
          status: data.status || 'PENDING',
          razorpayRefundId: data.razorpayRefundId || null,
          failureReason: data.failureReason || null,
        });
        if (data.events?.create) {
          const ev = data.events.create;
          attemptEventsStore.set(ev.id, { refundAttemptId: data.id, ...ev });
        }
        return attemptsStore.get(data.id);
      },
      createMany: async ({ data }: any) => {
        let count = 0;
        for (const item of data) {
          if (!attemptsStore.has(item.id)) {
            attemptsStore.set(item.id, {
              id: item.id,
              orderId: item.orderId,
              paymentId: item.paymentId,
              amount: item.amount,
              status: item.status || 'PENDING',
              razorpayRefundId: item.razorpayRefundId || null,
              failureReason: item.failureReason || null,
            });
            count += 1;
          }
        }
        return { count };
      },
      findUnique: async ({ where, include }: any) => {
        const a = attemptsStore.get(where.id);
        if (!a) return null;
        const res: any = { ...a };
        if (include?.events) {
          res.events = Array.from(attemptEventsStore.values()).filter((e) => e.refundAttemptId === a.id);
        }
        return res;
      },
      findFirst: async ({ where }: any = {}) => {
        for (const a of attemptsStore.values()) {
          if (where?.paymentId && a.paymentId !== where.paymentId) continue;
          if (where?.status?.in && !where.status.in.includes(a.status)) continue;
          if (where?.amount !== undefined && Math.round(Number(a.amount) * 100) !== Math.round(Number(where.amount) * 100)) continue;
          return { ...a };
        }
        return null;
      },
      findMany: async ({ where }: any = {}) => {
        const results: any[] = [];
        for (const a of attemptsStore.values()) {
          if (where?.paymentId) {
            if (typeof where.paymentId === 'string' && a.paymentId !== where.paymentId) continue;
            if (where.paymentId.in && !where.paymentId.in.includes(a.paymentId)) continue;
          }
          if (where?.status?.in && !where.status.in.includes(a.status)) continue;
          results.push({ ...a });
        }
        return results;
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const [id, a] of attemptsStore.entries()) {
          if (a.id !== where.id) continue;
          if (where.status?.in && !where.status.in.includes(a.status)) continue;
          attemptsStore.set(id, { ...a, ...data });
          count += 1;
        }
        return { count };
      },
    },
    refundAttemptEvent: {
      createMany: async ({ data }: any) => {
        let count = 0;
        for (const item of data) {
          if (!attemptEventsStore.has(item.id)) {
            attemptEventsStore.set(item.id, item);
            count += 1;
          }
        }
        return { count };
      },
    },
    refundRequest: {
      findFirst: async () => null,
      findUnique: async () => null,
      findMany: async () => [],
      create: async () => ({ id: 'mock-refund-request' }),
      update: async () => ({ id: 'mock-refund-request' }),
    },
  };
  return input(tx);
};

// =========================================================================
// TEST HELPERS
// =========================================================================
function makeAdminRequest(body: any, role: 'ADMIN' | 'SUPER_ADMIN' | 'CUSTOMER' | 'AGENT' | 'NONE' = 'ADMIN') {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (role !== 'NONE') {
    const token = signToken({ userId: 'test-user', role: role as any, phone: '+919999999999', customerId: 'cust-1' });
    headers.Cookie = `jio_token=${token}`;
  }
  return new NextRequest('http://localhost/api/admin/payments/refund', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

function makeWebhookRequest(payload: any, secret = process.env.RAZORPAY_WEBHOOK_SECRET || '') {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac('sha256', secret).update(rawBody).digest('hex');
  return new NextRequest('http://localhost/api/payments/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-razorpay-signature': signature,
    },
    body: rawBody,
  });
}

function setupFixtures() {
  paymentsStore.clear();
  ordersStore.clear();
  attemptsStore.clear();
  attemptEventsStore.clear();

  const payment: MockPayment = {
    id: 'pay_rec_1',
    orderId: 'order_1',
    amount: 149.0,
    direction: 'CUSTOMER_PAYS',
    gateway: 'RAZORPAY',
    gatewayOrderId: 'order_rzp_1',
    paymentId: 'pay_provider_1',
    status: 'CAPTURED',
  };

  const order: MockOrder = {
    id: 'order_1',
    orderNumber: 'JIO-TEST-101',
    customerId: 'cust-1',
    paymentStatus: 'CAPTURED',
    status: 'BOOKING_RECEIVED',
    financialDirection: 'CUSTOMER_PAYS',
    payments: [payment],
  };

  paymentsStore.set(payment.id, payment);
  ordersStore.set(order.id, order);
}

// =========================================================================
// SUITE EXECUTION
// =========================================================================
async function run() {
  console.log('--- RUNNING ROUTE-LEVEL REFUND AND WEBHOOK TEST SUITE ---');

  // 1. ADMIN AUTHORIZATION TESTS
  setupFixtures();
  {
    const unauthenticated = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }, 'NONE'));
    assert.equal(unauthenticated.status, 401, 'unauthenticated refund requests must return 401');

    const customerReq = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }, 'CUSTOMER'));
    assert.equal(customerReq.status, 403, 'customer role cannot access admin refund route');

    const agentReq = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }, 'AGENT'));
    assert.equal(agentReq.status, 403, 'agent role cannot access admin refund route');
  }

  // 2. INPUT VALIDATION TESTS
  setupFixtures();
  {
    const missingId = await adminRefundRoute(makeAdminRequest({}));
    assert.equal(missingId.status, 400, 'missing paymentRecordId returns 400');

    const notFound = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'non-existent' }));
    assert.equal(notFound.status, 404, 'non-existent payment returns 404');

    // JUNKITOUT_PAYS is not refundable through Razorpay
    paymentsStore.get('pay_rec_1')!.direction = 'JUNKITOUT_PAYS';
    const nonRefundable = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(nonRefundable.status, 400, 'non CUSTOMER_PAYS payment returns 400');
    paymentsStore.get('pay_rec_1')!.direction = 'CUSTOMER_PAYS';

    // Missing provider payment ID
    paymentsStore.get('pay_rec_1')!.paymentId = 'N/A';
    const missingProviderId = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(missingProviderId.status, 400, 'N/A provider payment ID returns 400');
    paymentsStore.get('pay_rec_1')!.paymentId = 'pay_provider_1';
  }

  // 3. SUCCESSFUL REFUND EXECUTION (Full Happy Path)
  setupFixtures();
  {
    const expectedKey = refundIdempotencyKey('pay_rec_1');
    razorpayHandler = (path, method, body) => {
      assert.equal(path, '/v1/payments/pay_provider_1/refund');
      assert.equal(method, 'POST');
      assert.equal(body.amount, 14900);
      return {
        status: 200,
        body: {
          id: 'rfnd_mock_success_1',
          payment_id: 'pay_provider_1',
          amount: 14900,
          currency: 'INR',
          status: 'processed',
          notes: { refund_request_key: expectedKey },
        },
      };
    };

    const res = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', reason: 'Customer requested' }));
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.data.status, 'REFUNDED');
    assert.equal(json.data.razorpayRefundId, 'rfnd_mock_success_1');

    // Verify DB was updated
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED');
  }

  // 4. DUPLICATE IN-FLIGHT REFUND (Reconciliation Lookup, Never Repeat Provider POST)
  setupFixtures();
  {
    const expectedKey = refundIdempotencyKey('pay_rec_1');
    paymentsStore.get('pay_rec_1')!.status = 'REFUND_PENDING';
    ordersStore.get('order_1')!.paymentStatus = 'REFUND_PENDING';

    let providerPostCalled = false;
    razorpayHandler = (path, method) => {
      if (method === 'POST') {
        providerPostCalled = true;
        throw new Error('POST should never be called for in-flight refund reconciliation');
      }
      assert.match(path, /\/v1\/payments\/pay_provider_1\/refunds/);
      return {
        status: 200,
        body: {
          items: [
            {
              id: 'rfnd_mock_in_flight_1',
              payment_id: 'pay_provider_1',
              amount: 14900,
              currency: 'INR',
              status: 'processed',
              notes: { refund_request_key: expectedKey },
            },
          ],
        },
      };
    };

    const res = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(res.status, 200);
    assert.equal(providerPostCalled, false, 'reconciliation must never repeat provider POST');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
  }

  // 5. PROVIDER REJECTION (Transitions to REFUND_FAILED)
  setupFixtures();
  {
    razorpayHandler = () => ({
      status: 422,
      body: { error: { description: 'Refund amount exceeds captured amount' } },
    });

    const res = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(res.status, 422, 'provider rejection returns 422');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUND_FAILED');
  }

  // 6. SAFE RECOVERY FOR REFUND_FAILED (Verified Provider Lookup & Safe Reset)
  setupFixtures();
  {
    paymentsStore.get('pay_rec_1')!.status = 'REFUND_FAILED';
    ordersStore.get('order_1')!.paymentStatus = 'REFUND_FAILED';

    // Step A: Status check on REFUND_FAILED when Razorpay has 0 refunds -> informs admin with canResetToCaptured
    razorpayHandler = () => ({
      status: 200,
      body: { items: [] },
    });

    const checkRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(checkRes.status, 200);
    const checkJson = await checkRes.json();
    assert.equal(checkJson.data.canResetToCaptured, true);

    // Step B: Reset action -> checks provider first, resets to CAPTURED
    const resetRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', action: 'reset_failed' }));
    assert.equal(resetRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'CAPTURED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'CAPTURED');

    // Step C: If Razorpay actually held a processed refund, action: 'reset_failed' updates to REFUNDED rather than resetting
    paymentsStore.get('pay_rec_1')!.status = 'REFUND_FAILED';
    ordersStore.get('order_1')!.paymentStatus = 'REFUND_FAILED';
    const expectedKey = refundIdempotencyKey('pay_rec_1');
    const attemptId = refundAttemptId('pay_rec_1');
    if (attemptsStore.has(attemptId)) attemptsStore.get(attemptId)!.status = 'REFUND_FAILED';
    razorpayHandler = () => ({
      status: 200,
      body: {
        items: [
          {
            id: 'rfnd_discovered_on_reset',
            payment_id: 'pay_provider_1',
            amount: 14900,
            currency: 'INR',
            status: 'processed',
            notes: { refund_request_key: expectedKey },
          },
        ],
      },
    });

    const resetWithProcessedRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', action: 'reset_failed' }));
    assert.equal(resetWithProcessedRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
  }

  // 7. WEBHOOK SIGNATURE & IDEMPOTENCY HANDLING
  setupFixtures();
  {
    const expectedKey = refundIdempotencyKey('pay_rec_1');
    const webhookPayload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_webhook_1',
            payment_id: 'pay_provider_1',
            amount: 14900,
            currency: 'INR',
            status: 'processed',
            notes: { refund_request_key: expectedKey },
          },
        },
      },
    };

    // Invalid signature rejection
    const badSig = makeWebhookRequest(webhookPayload, 'wrong_secret');
    const badSigRes = await paymentWebhookRoute(badSig);
    assert.equal(badSigRes.status, 400, 'invalid webhook signature is rejected');

    // Amount mismatch rejection
    const mismatchedPayload = {
      ...webhookPayload,
      payload: { refund: { entity: { ...webhookPayload.payload.refund.entity, amount: 9999 } } },
    };
    const mismatchRes = await paymentWebhookRoute(makeWebhookRequest(mismatchedPayload));
    assert.equal(mismatchRes.status, 400, 'amount mismatch is rejected');

    // Valid webhook delivery -> processes refund
    const validRes = await paymentWebhookRoute(makeWebhookRequest(webhookPayload));
    assert.equal(validRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED');

    // Duplicate webhook delivery -> idempotent success
    const duplicateRes = await paymentWebhookRoute(makeWebhookRequest(webhookPayload));
    assert.equal(duplicateRes.status, 200, 'duplicate webhook is handled idempotently');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
  }

  // 8. CUSTOMER RECONCILIATION SAFETY TEST
  setupFixtures();
  {
    // Mark order as REFUNDED
    ordersStore.get('order_1')!.paymentStatus = 'REFUNDED';
    paymentsStore.get('pay_rec_1')!.status = 'REFUNDED';

    const actor = { role: 'CUSTOMER', customerId: 'cust-1' };
    const reconciliationResult = await reconcilePaymentForOrder('order_1', actor as any);

    assert.equal(reconciliationResult.status, 'REFUNDED');
    assert.equal(reconciliationResult.reconciled, false);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED', 'reconciliation must NEVER overwrite refunded payment to CAPTURED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED', 'reconciliation must NEVER overwrite refunded order to CAPTURED');
  }

  // 9. LATE CAPTURE AFTER CANCELLATION
  setupFixtures();
  {
    const capturePayload = {
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_provider_1',
            order_id: 'order_rzp_1',
            amount: 14900,
            currency: 'INR',
          },
        },
      },
    };

    ordersStore.get('order_1')!.status = 'CANCELLED';
    paymentsStore.get('pay_rec_1')!.status = 'PENDING';

    const invalidSignatureRes = await paymentWebhookRoute(makeWebhookRequest(capturePayload, 'wrong_secret'));
    assert.equal(invalidSignatureRes.status, 400, 'invalid capture webhook signatures must be rejected');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'PENDING');
    assert.equal(attemptsStore.size, 0);

    let refundPostCount = 0;
    razorpayHandler = (_path, method, body) => {
      if (method === 'POST') {
        refundPostCount += 1;
        return {
          status: 200,
          body: {
            id: 'rfnd_late_capture_1',
            payment_id: 'pay_provider_1',
            amount: 14900,
            currency: 'INR',
            status: 'processed',
            notes: { refund_request_key: refundIdempotencyKey('pay_rec_1') },
          },
        };
      }
      return { status: 200, body: { items: [] } };
    };

    const firstCaptureRes = await paymentWebhookRoute(makeWebhookRequest(capturePayload));
    assert.equal(firstCaptureRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED');
    assert.equal(attemptsStore.get(refundAttemptId('pay_rec_1'))!.status, 'REFUNDED');
    assert.equal(refundPostCount, 1, 'the first late capture must initiate one provider refund');

    const duplicateCaptureRes = await paymentWebhookRoute(makeWebhookRequest(capturePayload));
    assert.equal(duplicateCaptureRes.status, 200, 'duplicate capture delivery must be idempotent');
    assert.equal(refundPostCount, 1, 'duplicate capture delivery must not repeat the provider refund');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED');

    setupFixtures();
    ordersStore.get('order_1')!.status = 'CANCELLED';
    paymentsStore.get('pay_rec_1')!.status = 'PENDING';
    refundPostCount = 0;
    razorpayHandler = () => {
      refundPostCount += 1;
      return {
        status: 422,
        body: { error: { description: 'Provider refund rejected' } },
      };
    };

    const failedCaptureRes = await paymentWebhookRoute(makeWebhookRequest(capturePayload));
    assert.equal(failedCaptureRes.status, 200, 'provider failure is recorded as a handled webhook result');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUND_FAILED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUND_FAILED');
    assert.equal(attemptsStore.get(refundAttemptId('pay_rec_1'))!.status, 'REFUND_FAILED');
    assert.equal(refundPostCount, 1);

    const retryCaptureRes = await paymentWebhookRoute(makeWebhookRequest(capturePayload));
    assert.equal(retryCaptureRes.status, 200, 'retrying the failed capture delivery remains safe');
    assert.equal(refundPostCount, 1, 'a repeated webhook must not duplicate a failed refund attempt');
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUND_FAILED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUND_FAILED');
  }

  // 10. PARTIAL REFUNDS WORKFLOW & AMOUNT VALIDATION
  setupFixtures();
  {
    // A. Rejection of negative amount
    const negRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: -25 }));
    assert.equal(negRes.status, 400, 'negative refund amount must be rejected');

    // B. Rejection of zero amount
    const zeroRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 0 }));
    assert.equal(zeroRes.status, 400, 'zero refund amount must be rejected');

    // C. Rejection of amount exceeding total payment amount (149)
    const excessRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 200 }));
    assert.equal(excessRes.status, 400, 'refund amount exceeding payment must be rejected');

    // D. Valid partial refund of ₹50
    razorpayHandler = (path: string, method: string, body: any) => {
      assert.equal(body.amount, 5000, 'partial refund amount must be sent in paise to provider');
      return {
        status: 200,
        body: {
          id: 'rfnd_part_1',
          payment_id: 'pay_provider_1',
          amount: 5000,
          currency: 'INR',
          status: 'processed',
          notes: body.notes,
        },
      };
    };

    const partRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 50, reason: 'First partial refund' }));
    assert.equal(partRes.status, 200);
    const partJson = await partRes.json();
    assert.equal(partJson.success, true);
    assert.equal(partJson.data.status, 'PARTIALLY_REFUNDED');
    assert.equal(partJson.data.amountRefunded, 50);
    assert.equal(partJson.data.remainingRefundableAmount, 99);

    // Verify DB reflects partial status
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'PARTIALLY_REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'PARTIALLY_REFUNDED');

    // Verify admin payments ledger exposes partial totals
    const ledgerReq = new NextRequest('http://localhost/api/admin/payments', {
      headers: { Cookie: `jio_token=${signToken({ userId: 'admin', role: 'ADMIN', phone: '+919999999999' })}` },
    });
    const ledgerRes = await adminPaymentsRoute(ledgerReq);
    const ledgerJson = await ledgerRes.json();
    const ledgerRecord = ledgerJson.data.find((p: any) => p.id === 'pay_rec_1');
    assert.equal(ledgerRecord.totalRefundedAmount, 50);
    assert.equal(ledgerRecord.remainingRefundableAmount, 99);
    assert.equal(ledgerRecord.status, 'PARTIALLY_REFUNDED');

    // E. Rejection of subsequent refund exceeding remaining balance (trying to refund 100 when only 99 remains)
    const excessSecondRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 100 }));
    assert.equal(excessSecondRes.status, 400, 'refund exceeding remaining refundable balance must be rejected');

    // F. Successful second partial refund of the remaining ₹99 -> transitions to full REFUNDED
    razorpayHandler = (path: string, method: string, body: any) => {
      assert.equal(body.amount, 9900);
      return {
        status: 200,
        body: {
          id: 'rfnd_part_2',
          payment_id: 'pay_provider_1',
          amount: 9900,
          currency: 'INR',
          status: 'processed',
          notes: body.notes,
        },
      };
    };

    const finalPartRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 99, reason: 'Final partial refund' }));
    assert.equal(finalPartRes.status, 200);
    const finalJson = await finalPartRes.json();
    assert.equal(finalJson.data.status, 'REFUNDED');
    assert.equal(finalJson.data.remainingRefundableAmount, 0);

    // Verify DB reflects complete refund
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'REFUNDED');

    // G. Attempting further refund on fully refunded payment is rejected
    const postRefundRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1', amount: 10 }));
    assert.equal(postRefundRes.status, 400, 'refund on fully refunded payment must be rejected');
  }

  // 10. REPEATED REQUESTS & CUSTOM IDEMPOTENCY KEY
  setupFixtures();
  {
    let providerCalls = 0;
    razorpayHandler = (path: string, method: string, body: any) => {
      providerCalls += 1;
      return {
        status: 200,
        body: {
          id: 'rfnd_idem_mock',
          payment_id: 'pay_provider_1',
          amount: body.amount,
          currency: 'INR',
          status: 'processed',
          notes: body.notes,
        },
      };
    };

    // First call with custom idempotencyKey
    const firstCall = await adminRefundRoute(makeAdminRequest({
      paymentRecordId: 'pay_rec_1',
      amount: 40,
      idempotencyKey: 'idem_req_custom_1',
    }));
    assert.equal(firstCall.status, 200);
    assert.equal(providerCalls, 1);

    // Second repeated call with the identical idempotencyKey
    const repeatCall = await adminRefundRoute(makeAdminRequest({
      paymentRecordId: 'pay_rec_1',
      amount: 40,
      idempotencyKey: 'idem_req_custom_1',
    }));
    assert.equal(repeatCall.status, 200);
    assert.equal(providerCalls, 1, 'provider must NOT be called again for identical idempotency key');
  }

  // 11. CONCURRENT REQUESTS PROTECTION
  setupFixtures();
  {
    // Simulate payment currently claimed in-flight by a concurrent request
    paymentsStore.get('pay_rec_1')!.status = 'REFUND_PROCESSING';
    ordersStore.get('order_1')!.paymentStatus = 'REFUND_PROCESSING';
    attemptsStore.set('attempt_concurrent', {
      id: 'attempt_concurrent',
      paymentId: 'pay_rec_1',
      orderId: 'order_1',
      amount: 50,
      status: 'REFUND_PROCESSING',
      razorpayRefundId: null,
      failureReason: null,
    });

    let concurrentProviderCalled = false;
    razorpayHandler = (path: string, method: string) => {
      if (method === 'POST') {
        concurrentProviderCalled = true;
      }
      return { status: 200, body: { items: [] } };
    };

    // Attempting a refund while another attempt is claimed returns status check / pending
    const concurrentRes = await adminRefundRoute(makeAdminRequest({
      paymentRecordId: 'pay_rec_1',
      amount: 50,
    }));
    assert.equal(concurrentProviderCalled, false, 'concurrent request must NOT call refund POST on provider');
    assert.equal(concurrentRes.status, 202, 'in-flight concurrent request returns pending reconciliation');
  }

  // 12. TIMEOUT RECOVERY FOR PARTIAL REFUNDS
  setupFixtures();
  {
    // Step A: Provider times out on partial refund of ₹30
    razorpayHandler = () => {
      throw new Error('ETIMEDOUT: Connection timed out');
    };

    const timeoutRes = await adminRefundRoute(makeAdminRequest({
      paymentRecordId: 'pay_rec_1',
      amount: 30,
      idempotencyKey: 'timeout_test_key',
    }));
    assert.equal(timeoutRes.status, 202);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'REFUND_PENDING_RECONCILIATION');

    // Step B: Reconcile check finds the ₹30 processed refund on Razorpay
    const expectedKey = refundIdempotencyKey('pay_rec_1', 'timeout_test_key');
    razorpayHandler = () => ({
      status: 200,
      body: {
        items: [
          {
            id: 'rfnd_recovered_partial',
            payment_id: 'pay_provider_1',
            amount: 3000,
            currency: 'INR',
            status: 'processed',
            notes: { refund_request_key: expectedKey },
          },
        ],
      },
    });

    const recoverRes = await adminRefundRoute(makeAdminRequest({ paymentRecordId: 'pay_rec_1' }));
    assert.equal(recoverRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'PARTIALLY_REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'PARTIALLY_REFUNDED');
  }

  // 13. PARTIAL REFUND WEBHOOK HANDLING
  setupFixtures();
  {
    // Create an in-flight partial refund attempt of ₹60
    const attemptKey = refundIdempotencyKey('pay_rec_1', 'webhook_partial_key');
    const attemptId = refundAttemptId('pay_rec_1', 'webhook_partial_key');
    attemptsStore.set(attemptId, {
      id: attemptId,
      orderId: 'order_1',
      paymentId: 'pay_rec_1',
      amount: 60,
      status: 'REFUND_PROCESSING',
      razorpayRefundId: null,
      failureReason: null,
    });
    paymentsStore.get('pay_rec_1')!.status = 'REFUND_PROCESSING';
    ordersStore.get('order_1')!.paymentStatus = 'REFUND_PROCESSING';

    const webhookPartialPayload = {
      event: 'refund.processed',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_webhook_part_1',
            payment_id: 'pay_provider_1',
            amount: 6000,
            currency: 'INR',
            status: 'processed',
            notes: { refund_request_key: attemptKey, attempt_id: attemptId },
          },
        },
      },
    };

    const webhookRes = await paymentWebhookRoute(makeWebhookRequest(webhookPartialPayload));
    assert.equal(webhookRes.status, 200);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'PARTIALLY_REFUNDED');
    assert.equal(ordersStore.get('order_1')!.paymentStatus, 'PARTIALLY_REFUNDED');
    assert.equal(attemptsStore.get(attemptId)!.status, 'REFUNDED');
  }

  // 14. ORDER DISPATCH & RECONCILIATION PREVENTION ON REFUNDED ORDERS
  setupFixtures();
  {
    // Test on PARTIALLY_REFUNDED
    paymentsStore.get('pay_rec_1')!.status = 'PARTIALLY_REFUNDED';
    ordersStore.get('order_1')!.paymentStatus = 'PARTIALLY_REFUNDED';

    // A. dispatchPaidOrderToAgents must never assign or dispatch partially refunded orders
    await dispatchPaidOrderToAgents('order_1');
    assert.equal(ordersStore.get('order_1')!.status, 'BOOKING_RECEIVED', 'partially refunded order must not be auto-assigned');

    // B. Customer payment reconciliation must never overwrite partially refunded orders
    const custActor = { role: 'CUSTOMER', customerId: 'cust-1' };
    const reconcilePartialRes = await reconcilePaymentForOrder('order_1', custActor as any);
    assert.equal(reconcilePartialRes.status, 'PARTIALLY_REFUNDED');
    assert.equal(reconcilePartialRes.reconciled, false);
    assert.equal(paymentsStore.get('pay_rec_1')!.status, 'PARTIALLY_REFUNDED', 'customer reconciliation must not overwrite PARTIALLY_REFUNDED');

    // Test on fully REFUNDED
    paymentsStore.get('pay_rec_1')!.status = 'REFUNDED';
    ordersStore.get('order_1')!.paymentStatus = 'REFUNDED';

    await dispatchPaidOrderToAgents('order_1');
    assert.equal(ordersStore.get('order_1')!.status, 'BOOKING_RECEIVED', 'refunded order must not be auto-assigned');

    const reconcileFullRes = await reconcilePaymentForOrder('order_1', custActor as any);
    assert.equal(reconcileFullRes.status, 'REFUNDED');
    assert.equal(reconcileFullRes.reconciled, false);
  }

  console.log('ALL ROUTE-LEVEL REFUND AND WEBHOOK TESTS PASSED SUCCESSFULLY.');
}

run()
  .catch((err) => {
    console.error('Test failure:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    https.request = originalHttpsRequest;
    (db as any).$transaction = originalTransaction;
    await db.$disconnect();
  });
