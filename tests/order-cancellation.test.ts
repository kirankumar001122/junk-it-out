import type { NextRequest } from 'next/server';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return require.resolve('../package.json');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

process.env.JWT_SECRET = 'test-cancellation-secret-key-2026';

type MockOrder = {
  id: string;
  orderNumber: string;
  customerId: string;
  customer: { userId: string; user: { id: string } };
  agentId: string | null;
  agent?: { id: string; userId: string; user: { name: string; phone: string } } | null;
  status: string;
  paymentStatus: string;
  cancellationReason: string | null;
  financialDirection?: string;
  items?: any[];
  weightRecords?: any[];
  invoices?: any[];
};

const initialOrder: MockOrder = {
  id: 'order-1',
  orderNumber: 'JIO-TEST-1',
  customerId: 'customer-1',
  customer: { userId: 'user-1', user: { id: 'user-1' } },
  agentId: null,
  agent: null,
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'PENDING',
  cancellationReason: null,
  financialDirection: 'CUSTOMER_PAYS',
  items: [{ id: 'item-1', categoryId: 'cat-1', estimatedWeight: 5 }],
  weightRecords: [],
  invoices: [],
};

let state = initialOrder;
let paymentState: { id: string; orderId: string; amount: number; direction: string; status: string; paymentId?: string } | null = null;
let refundAttempts: any[] = [];
let refundAttemptEvents: any[] = [];
let refundRequests: any[] = [];
let agentStatusUpdates: any[] = [];
let broadcastEvents: { event: string; payload: any }[] = [];
let histories: unknown[] = [];
let audits: unknown[] = [];
let failAuditWrite = false;
let simulateMissingRefundRequestTable = false;
let simulateOtherActiveAgentOrders = false;
let transactionQueue = Promise.resolve();

function clone<T>(value: T): T {
  return structuredClone(value);
}

async function run() {
  const { NextRequest } = await import('next/server');
  const { POST: cancelOrder } = await import('../app/api/orders/[id]/cancel/route');
  const { GET: getOrders } = await import('../app/api/orders/route');
  const { POST: startOrder } = await import('../app/api/orders/[id]/start/route');
  const { POST: arriveOrder } = await import('../app/api/orders/[id]/arrive/route');
  const { POST: weighOrder } = await import('../app/api/orders/[id]/weigh/route');
  const { POST: completeOrder } = await import('../app/api/orders/[id]/complete/route');
  const { POST: acceptOrder } = await import('../app/api/orders/[id]/accept/route');
  const { db } = await import('../lib/db');
  const { signToken } = await import('../lib/auth/jwt');
  const { broadcaster } = await import('../lib/realtime');

  // Track realtime broadcasts
  const originalBroadcast = broadcaster.broadcast.bind(broadcaster);
  broadcaster.broadcast = (event: string, payload: any) => {
    broadcastEvents.push({ event, payload });
    return originalBroadcast(event as any, payload);
  };

  const orderDelegate = db.order as any;
  (db as any).user = { ...(db as any).user, findUnique: async () => ({ tokenVersion: 1 }) };
  (db as any).agent = {
    ...(db as any).agent,
    findUnique: async ({ where }: any) => ({
      id: where?.id || 'agent-1',
      userId: 'agent-user-1',
      status: 'ASSIGNED',
      serviceAreas: ['Koramangala'],
      vehicleNumber: 'KA-01-AB-1234',
      user: { id: 'agent-user-1', name: 'Agent Ram', phone: '9876543210' },
    }),
    update: async ({ where, data }: any) => {
      agentStatusUpdates.push({ where, data });
      return { id: where.id, ...data };
    },
  };

  const originalFindUnique = orderDelegate.findUnique;
  const originalFindFirst = orderDelegate.findFirst;
  const originalFindMany = orderDelegate.findMany;
  const originalTransaction = (db as any).$transaction;

  orderDelegate.findUnique = async ({ where }: { where: { id: string } }) =>
    where.id === state.id ? clone(state) : null;

  orderDelegate.findFirst = async ({ where }: any) => {
    if (where?.id === state.id || where?.orderNumber === state.orderNumber) {
      return clone(state);
    }
    if (where?.OR?.some((c: any) => c.id === state.id || c.orderNumber === state.orderNumber)) {
      return clone(state);
    }
    return null;
  };

  orderDelegate.findMany = async ({ where }: any) => {
    let orders = [clone(state)];
    if (where?.AND) {
      for (const condition of where.AND) {
        if (condition?.OR) {
          orders = orders.filter((o) =>
            condition.OR.some((branch: any) => {
              if (branch.financialDirection?.not && o.financialDirection !== branch.financialDirection.not) return true;
              if (branch.financialDirection && branch.OR) {
                return branch.OR.some((sub: any) => {
                  if (sub.paymentStatus?.in && sub.paymentStatus.in.includes(o.paymentStatus)) return true;
                  if (sub.status && o.status === sub.status) return true;
                  return false;
                });
              }
              return false;
            })
          );
        }
      }
    }
    if (where?.status?.in) {
      orders = orders.filter((o) => where.status.in.includes(o.status));
    }
    return orders;
  };

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
        count: async () => (simulateOtherActiveAgentOrders ? 1 : 0),
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
      refundRequest: {
        findUnique: async ({ where }: any) => {
          if (simulateMissingRefundRequestTable) {
            const err: any = new Error('The table public.RefundRequest does not exist in the current database.');
            err.code = 'P2021';
            throw err;
          }
          return refundRequests.find((r) => r.orderId === where.orderId) || null;
        },
        create: async ({ data }: any) => {
          if (simulateMissingRefundRequestTable) {
            const err: any = new Error('The table public.RefundRequest does not exist in the current database.');
            err.code = 'P2021';
            throw err;
          }
          const created = { id: `rr-${Date.now()}`, ...data };
          refundRequests.push(created);
          return created;
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
      agent: {
        update: async ({ where, data }: any) => {
          agentStatusUpdates.push({ where, data });
        },
      },
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

  function makeAgentActionRequest(path: string, options: { body?: Record<string, unknown> } = {}) {
    const token = signToken({
      userId: 'agent-user-1',
      agentId: 'agent-1',
      phone: '9876543210',
      role: 'AGENT',
    });
    return new NextRequest(`http://localhost${path}`, {
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
    refundRequests = [];
    agentStatusUpdates = [];
    broadcastEvents = [];
    histories = [];
    audits = [];
    failAuditWrite = false;
    simulateMissingRefundRequestTable = false;
    simulateOtherActiveAgentOrders = false;
    await transactionQueue;
  }

  try {
    console.log('--- Test 1: Unauthenticated request fails ---');
    await reset();
    const unauthenticated = await invoke(new NextRequest('http://localhost/api/orders/order-1/cancel', { method: 'POST' }));
    assert.equal(unauthenticated.status, 401);
    assert.equal(state.status, 'BOOKING_RECEIVED');

    console.log('--- Test 2: IDOR protection ---');
    await reset();
    const otherCustomer = await invoke(makeRequest({ userId: 'user-2', customerId: 'customer-2' }));
    assert.equal(otherCustomer.status, 404, 'unauthorized customer returns 404 for IDOR protection');
    assert.equal(state.status, 'BOOKING_RECEIVED');

    console.log('--- Test 3: Spoofed body identity ignored, auth identity used ---');
    await reset();
    const spoofedIdentity = await invoke(makeRequest({ body: { userId: 'user-2', cancellationReason: 'Changed plans' } }));
    assert.equal(spoofedIdentity.status, 200);
    assert.equal(state.status, 'CANCELLED');
    assert.equal((histories[0] as any).changedByUserId, 'user-1');
    assert.equal((audits[0] as any).userId, 'user-1');
    assert.equal(state.cancellationReason, 'Changed plans');

    console.log('--- Test 4: Admin cancellation allowed ---');
    await reset();
    const admin = await invoke(makeRequest({ userId: 'admin-1', role: 'ADMIN' }));
    assert.equal(admin.status, 200, 'an authenticated admin may cancel an otherwise cancellable order');

    console.log('--- Test 5: Customer cancellation after agent arrival rejected ---');
    await reset('AGENT_ARRIVED');
    const arrived = await invoke(makeRequest());
    assert.equal(arrived.status, 409, 'customer cancellation after agent arrival is rejected');
    assert.equal(state.status, 'AGENT_ARRIVED');
    assert.equal(histories.length, 0);
    assert.equal(audits.length, 0);

    console.log('--- Test 6: Terminal status cannot be cancelled again ---');
    await reset('CANCELLED');
    const terminal = await invoke(makeRequest({ role: 'ADMIN', userId: 'admin-1' }));
    assert.equal(terminal.status, 409, 'terminal states cannot be cancelled again');
    assert.equal(histories.length, 0);

    console.log('--- Test 7: Duplicate concurrent cancellation returns one 200 and one 409 ---');
    await reset();
    const concurrent = await Promise.all([invoke(makeRequest()), invoke(makeRequest())]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 409]);
    assert.equal(state.status, 'CANCELLED');
    assert.equal(histories.length, 1);
    assert.equal(audits.length, 1);

    console.log('--- Test 8: Transaction rollback on failure ---');
    await reset();
    failAuditWrite = true;
    const failedTransaction = await invoke(makeRequest());
    assert.equal(failedTransaction.status, 500);
    assert.equal(state.status, 'BOOKING_RECEIVED');
    assert.equal(histories.length, 0);
    assert.equal(audits.length, 0);

    console.log('--- Test 9: Production P2021 resilience (missing RefundRequest table) ---');
    // Simulates the exact production error: Prisma P2021 (table public.RefundRequest does not exist)
    await reset('AGENT_ON_WAY', 'CAPTURED');
    simulateMissingRefundRequestTable = true;
    paymentState = {
      id: 'pay-p2021',
      orderId: 'order-1',
      amount: 91.0,
      direction: 'CUSTOMER_PAYS',
      status: 'CAPTURED',
    };
    const p2021Cancellation = await invoke(makeRequest({ body: { cancellationReason: 'Urgent cancellation test' } }));
    assert.equal(p2021Cancellation.status, 200, 'Cancellation must succeed even when RefundRequest table is missing in DB');
    assert.equal(state.status, 'CANCELLED');
    assert.equal(state.paymentStatus, 'REFUND_PENDING', 'Payment status must be marked REFUND_PENDING');
    assert.equal(paymentState.status, 'REFUND_PENDING');
    assert.equal(refundAttempts.length, 1);
    assert.equal(refundAttempts[0].status, 'RECONCILIATION_REQUIRED');
    assert.equal(refundAttempts[0].amount, 91.0);
    assert.equal(refundAttemptEvents.length, 1);
    assert.equal(refundAttemptEvents[0].eventType, 'ORDER_CANCELLED');
    assert.equal(refundAttemptEvents[0].status, 'REFUND_PENDING');

    console.log('--- Test 10: RefundRequest creation when table exists ---');
    await reset('AGENT_ACCEPTED', 'CAPTURED');
    state.agentId = 'agent-1';
    simulateMissingRefundRequestTable = false;
    paymentState = {
      id: 'pay-migrated',
      orderId: 'order-1',
      amount: 91.0,
      direction: 'CUSTOMER_PAYS',
      status: 'CAPTURED',
      paymentId: 'rzp_pay_migrated_123',
    };
    const normalPaidCancellation = await invoke(makeRequest({ body: { cancellationReason: 'Cancelled with DB table present' } }));
    assert.equal(normalPaidCancellation.status, 200);
    assert.equal(state.status, 'CANCELLED');
    assert.equal(refundRequests.length, 1, 'RefundRequest row created successfully');
    assert.equal(refundRequests[0].amount, 91.0);
    assert.equal(refundRequests[0].status, 'PENDING_ADMIN_REVIEW');

    console.log('--- Test 11: Realtime event broadcast on cancellation ---');
    assert(broadcastEvents.some((e) => e.event === 'ORDER_UPDATED' && e.payload?.status === 'CANCELLED'));
    assert(broadcastEvents.some((e) => e.event === 'ORDER_CANCELLED' && e.payload?.status === 'CANCELLED'));

    console.log('--- Test 12: Agent cannot advance a cancelled order ---');
    await reset('CANCELLED', 'REFUND_PENDING');
    state.agentId = 'agent-1';

    const startAttempt = await startOrder(
      makeAgentActionRequest('/api/orders/order-1/start'),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    assert.equal(startAttempt.status, 409, 'Agent cannot start a cancelled order');
    const startData = await startAttempt.json();
    assert.equal(startData.error?.code, 'ORDER_CANCELLED');

    const arriveAttempt = await arriveOrder(
      makeAgentActionRequest('/api/orders/order-1/arrive'),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    assert.equal(arriveAttempt.status, 409, 'Agent cannot arrive at a cancelled order');

    const weighAttempt = await weighOrder(
      makeAgentActionRequest('/api/orders/order-1/weigh', {
        body: { actualWeights: [{ itemId: 'item-1', actualWeight: 5 }] },
      }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    assert.equal(weighAttempt.status, 409, 'Agent cannot record weights for a cancelled order');

    const completeAttempt = await completeOrder(
      makeAgentActionRequest('/api/orders/order-1/complete', {
        body: { actualWeights: [{ itemId: 'item-1', actualWeight: 5 }] },
      }),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    assert.equal(completeAttempt.status, 409, 'Agent cannot complete a cancelled order');

    const acceptAttempt = await acceptOrder(
      makeAgentActionRequest('/api/orders/order-1/accept'),
      { params: Promise.resolve({ id: 'order-1' }) }
    );
    assert.equal(acceptAttempt.status, 409, 'Agent cannot accept a cancelled order');

    console.log('--- Test 13: Agent active queue removal after cancellation ---');
    await reset('CANCELLED', 'REFUND_PENDING');
    state.agentId = 'agent-1';
    state.financialDirection = 'CUSTOMER_PAYS';

    const agentOrdersReq = new NextRequest('http://localhost/api/orders?limit=20', {
      method: 'GET',
      headers: {
        Cookie: `jio_token=${signToken({ userId: 'agent-user-1', agentId: 'agent-1', phone: '9876543210', role: 'AGENT' })}`,
      },
    });
    const agentOrdersRes = await getOrders(agentOrdersReq);
    const agentOrdersData = await agentOrdersRes.json();
    assert.equal(agentOrdersRes.status, 200);
    // Cancelled order is excluded from agent active orders
    const activeForAgent = agentOrdersData.data.filter((o: any) =>
      ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'].includes(o.status)
    );
    assert.equal(activeForAgent.length, 0, 'Cancelled order must not be in agent active queue');

    console.log('--- Test 14: Agent status handling when order cancelled ---');
    // Scenario A: Agent has no other active assignments -> status resets to AVAILABLE
    await reset('AGENT_ON_WAY');
    state.agentId = 'agent-1';
    simulateOtherActiveAgentOrders = false;
    await invoke(makeRequest());
    assert(agentStatusUpdates.some((u) => u.where?.id === 'agent-1' && u.data?.status === 'AVAILABLE'), 'Agent with no other orders set to AVAILABLE');

    // Scenario B: Agent has another active assignment -> status NOT reset to AVAILABLE
    await reset('AGENT_ON_WAY');
    state.agentId = 'agent-1';
    simulateOtherActiveAgentOrders = true;
    agentStatusUpdates = [];
    await invoke(makeRequest());
    assert.equal(agentStatusUpdates.length, 0, 'Agent with other active orders is not set to AVAILABLE');

    console.log('All cancellation, P2021 resilience, agent synchronization, and security regression tests passed successfully!');
  } finally {
    orderDelegate.findUnique = originalFindUnique;
    orderDelegate.findFirst = originalFindFirst;
    orderDelegate.findMany = originalFindMany;
    (db as any).$transaction = originalTransaction;
    broadcaster.broadcast = originalBroadcast;
    await db.$disconnect();
  }
}

void run();
