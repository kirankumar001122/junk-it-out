import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as cancelOrder } from '../app/api/orders/[id]/cancel/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

type MockOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: { userId: string; user: { id: string } };
  agentId: string | null;
  status: string;
  paymentStatus: string;
  cancellationReason: string | null;
};

const initialOrder: MockOrder = {
  id: 'order-1',
  orderNumber: 'JIO-TEST-1',
  customerId: 'customer-1',
  customer: { userId: 'user-1', user: { id: 'user-1' } },
  agentId: null,
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'PENDING',
  cancellationReason: null,
};

let state = initialOrder;
let paymentState: { id: string; orderId: string; amount: number; direction: string; status: string } | null = null;
let refundAttempts: any[] = [];
let refundAttemptEvents: any[] = [];
let histories: unknown[] = [];
let audits: unknown[] = [];
let failAuditWrite = false;
let transactionQueue = Promise.resolve();

function clone<T>(value: T): T {
  return structuredClone(value);
}

const orderDelegate = db.order as any;
const originalFindUnique = orderDelegate.findUnique;
const originalTransaction = (db as any).$transaction;

orderDelegate.findUnique = async ({ where }: { where: { id: string } }) =>
  where.id === state.id ? clone(state) : null;

(db as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => {
  let release!: () => void;
  const previous = transactionQueue;
  transactionQueue = new Promise<void>((resolve) => { release = resolve; });
  await previous;

  let workingOrder = clone(state);
  const workingHistories = clone(histories);
  const workingAudits = clone(audits);
  const tx = {
    order: {
      updateMany: async ({ where, data }: any) => {
        if (workingOrder.id !== where.id || workingOrder.status !== where.status) return { count: 0 };
        workingOrder = { ...workingOrder, ...data };
        return { count: 1 };
      },
      findUnique: async () => clone(workingOrder),
      findFirst: async () => null,
    },
    payment: {
      findFirst: async ({ where }: any) => {
        if (!paymentState) return null;
        if (paymentState.orderId === where.orderId && paymentState.status === where.status) {
          return clone(paymentState);
        }
        return null;
      },
      updateMany: async ({ where, data }: any) => {
        if (paymentState && paymentState.id === where.id) {
          paymentState = { ...paymentState, ...data };
          return { count: 1 };
        }
        return { count: 0 };
      },
    },
    refundAttempt: {
      upsert: async ({ where, create, update }: any) => {
        const existingIdx = refundAttempts.findIndex((a) => a.id === where.id);
        if (existingIdx >= 0) {
          refundAttempts[existingIdx] = { ...refundAttempts[existingIdx], ...update };
          return refundAttempts[existingIdx];
        }
        refundAttempts.push(create);
        return create;
      },
    },
    refundAttemptEvent: {
      create: async ({ data }: any) => {
        refundAttemptEvents.push(data);
        return data;
      },
    },
    orderStatusHistory: {
      create: async ({ data }: any) => { workingHistories.push(data); },
    },
    auditLog: {
      create: async ({ data }: any) => {
        if (failAuditWrite) throw new Error('mock audit write failure');
        workingAudits.push(data);
      },
    },
    agent: { update: async () => undefined },
  };

  try {
    const result = await callback(tx);
    state = workingOrder;
    histories = workingHistories;
    audits = workingAudits;
    return result;
  } finally {
    release();
  }
};

function makeRequest(options: {
  userId?: string;
  customerId?: string;
  role?: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';
  body?: Record<string, unknown>;
} = {}) {
  const { userId = 'user-1', customerId = 'customer-1', role = 'CUSTOMER' } = options;
  const token = signToken({ userId, customerId, phone: 'test-only', role });
  return new NextRequest('http://localhost/api/orders/order-1/cancel', {
    method: 'POST',
    headers: {
      Cookie: `jio_token=${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(options.body ?? {}),
  });
}

async function invoke(req: NextRequest) {
  return cancelOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
}

async function reset(status = 'BOOKING_RECEIVED', paymentStatus = 'PENDING') {
  state = { ...clone(initialOrder), status, paymentStatus };
  paymentState = null;
  refundAttempts = [];
  refundAttemptEvents = [];
  histories = [];
  audits = [];
  failAuditWrite = false;
  await transactionQueue;
}

async function run() {
  try {
    await reset();
    const unauthenticated = await invoke(new NextRequest('http://localhost/api/orders/order-1/cancel', { method: 'POST' }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(state.status, 'BOOKING_RECEIVED');

    await reset();
    const otherCustomer = await invoke(makeRequest({ userId: 'user-2', customerId: 'customer-2' }));
    assert.equal(otherCustomer.status, 403);
    assert.equal(state.status, 'BOOKING_RECEIVED');

    await reset();
    const spoofedIdentity = await invoke(makeRequest({ body: { userId: 'user-2', cancellationReason: 'Changed plans' } }));
    assert.equal(spoofedIdentity.status, 200);
    assert.equal(state.status, 'CANCELLED');
    assert.equal((histories[0] as any).changedByUserId, 'user-1');
    assert.equal((audits[0] as any).userId, 'user-1');
    assert.equal(state.cancellationReason, 'Changed plans');

    await reset();
    const admin = await invoke(makeRequest({ userId: 'admin-1', role: 'ADMIN' }));
    assert.equal(admin.status, 200, 'an authenticated admin may cancel an otherwise cancellable order');

    await reset('AGENT_ARRIVED');
    const arrived = await invoke(makeRequest());
    assert.equal(arrived.status, 409, 'customer cancellation after agent arrival is rejected');
    assert.equal(state.status, 'AGENT_ARRIVED');
    assert.equal(histories.length, 0);
    assert.equal(audits.length, 0);

    await reset('CANCELLED');
    const terminal = await invoke(makeRequest({ role: 'ADMIN', userId: 'admin-1' }));
    assert.equal(terminal.status, 409, 'terminal states cannot be cancelled again');
    assert.equal(histories.length, 0);

    await reset();
    const concurrent = await Promise.all([invoke(makeRequest()), invoke(makeRequest())]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    assert.equal(state.status, 'CANCELLED');
    assert.equal(histories.length, 1);
    assert.equal(audits.length, 1);

    await reset();
    failAuditWrite = true;
    const failedTransaction = await invoke(makeRequest());
    assert.equal(failedTransaction.status, 500);
    assert.equal(state.status, 'BOOKING_RECEIVED');
    assert.equal(histories.length, 0);
    assert.equal(audits.length, 0);

    // Paid order cancellation: transitions paymentStatus to REFUND_PENDING and registers refundAttempt
    await reset('BOOKING_RECEIVED', 'CAPTURED');
    paymentState = {
      id: 'pay-1',
      orderId: 'order-1',
      amount: 149.0,
      direction: 'CUSTOMER_PAYS',
      status: 'CAPTURED',
    };
    const paidCancellation = await invoke(makeRequest({ body: { cancellationReason: 'Customer requested refund on cancel' } }));
    assert.equal(paidCancellation.status, 200);
    assert.equal(state.status, 'CANCELLED');
    assert.equal(state.paymentStatus, 'REFUND_PENDING');
    assert.equal(paymentState.status, 'REFUND_PENDING');
    assert.equal(refundAttempts.length, 1);
    assert.equal(refundAttempts[0].status, 'RECONCILIATION_REQUIRED');
    assert.equal(refundAttempts[0].amount, 149.0);
    assert.equal(refundAttemptEvents.length, 1);
    assert.equal(refundAttemptEvents[0].eventType, 'ORDER_CANCELLED');
    assert.equal(refundAttemptEvents[0].status, 'REFUND_PENDING');

    console.log('Order cancellation authorization, state, concurrency, rollback, and paid refund tracking tests passed.');
  } finally {
    orderDelegate.findUnique = originalFindUnique;
    (db as any).$transaction = originalTransaction;
    await db.$disconnect();
  }
}

void run();
