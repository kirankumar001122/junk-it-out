import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as assignOrder } from '../app/api/orders/[id]/assign/route';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { POST as startOrder } from '../app/api/orders/[id]/start/route';
import { POST as arriveOrder } from '../app/api/orders/[id]/arrive/route';
import { POST as completeOrder } from '../app/api/orders/[id]/complete/route';
import { POST as cancelOrder } from '../app/api/orders/[id]/cancel/route';
import { POST as statusOrder } from '../app/api/orders/[id]/status/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { validateStatusTransition } from '../lib/validations/schemas';

process.env.JWT_SECRET = 'concurrency-test-secret-at-least-32-bytes';

function createMockToken(role: 'ADMIN' | 'AGENT' | 'CUSTOMER' | 'SUPER_ADMIN', extra: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-user`,
    phone: '9999999999',
    name: `${role} User`,
    role,
    ...extra,
  });
}

function makeRequest(url: string, token: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: {
      Cookie: `jio_token=${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function run() {
  const original = {
    orderFindFirst: (db.order as any).findFirst,
    orderFindUnique: (db.order as any).findUnique,
    agentFindUnique: (db.agent as any).findUnique,
    auditLogCreate: (db.auditLog as any).create,
    notificationCreate: (db.notification as any).create,
    transaction: (db as any).$transaction,
  };

  let orderState: any = {
    id: 'order-concurrency-1',
    orderNumber: 'JIO-CONCURRENT-1',
    customerId: 'customer-1',
    customer: { userId: 'customer-user-1', user: { phone: '9876543210', name: 'Cust' } },
    address: { area: 'JP Nagar' },
    agentId: null,
    status: 'BOOKING_RECEIVED',
    paymentStatus: 'CAPTURED',
    financialDirection: 'CUSTOMER_PAYS',
    finalAmount: 150,
    items: [],
    invoices: [],
    weightRecords: [{ id: 'weight-1', weightJson: '[]' }],
  };

  let agent1: any = {
    id: 'agent-1',
    userId: 'agent-user-1',
    status: 'AVAILABLE',
    vehicleNumber: 'KA-01-1234',
    serviceAreas: 'JP Nagar, Koramangala',
    user: { name: 'Agent One' },
  };

  let agent2: any = {
    id: 'agent-2',
    userId: 'agent-user-2',
    status: 'AVAILABLE',
    vehicleNumber: 'KA-02-5678',
    serviceAreas: 'JP Nagar, Koramangala',
    user: { name: 'Agent Two' },
  };

  let txQueue = Promise.resolve();

  (db.order as any).findFirst = async () => ({ ...orderState });
  (db.order as any).findUnique = async ({ where }: any) => {
    if (where.id === orderState.id || where.id === orderState.orderNumber) {
      return { ...orderState };
    }
    return null;
  };

  (db.agent as any).findUnique = async ({ where }: any) => {
    if (where.id === 'agent-1') return { ...agent1 };
    if (where.id === 'agent-2') return { ...agent2 };
    return null;
  };

  (db.auditLog as any).create = async () => ({ id: 'audit-mock-id' });
  (db.notification as any).create = async () => ({ id: 'notif-mock-id' });

  (db as any).$transaction = async (callback: (tx: any) => Promise<any>) => {
    let release!: () => void;
    const prev = txQueue;
    txQueue = new Promise<void>((res) => { release = res; });
    await prev;

    try {
      const workingOrder = { ...orderState };
      const tx = {
        $queryRaw: async () => [],
        order: {
          findFirst: async () => null,
          update: async ({ data }: any) => {
            Object.assign(workingOrder, data);
            Object.assign(orderState, data);
            return { ...orderState, ...data };
          },
          updateMany: async ({ where, data }: any) => {
            if (where.id !== workingOrder.id) return { count: 0 };

            if (where.OR) {
              const matched = where.OR.some((cond: any) => {
                const statusMatch = cond.status?.in ? cond.status.in.includes(workingOrder.status) : (!cond.status || cond.status === workingOrder.status);
                const agentMatch = cond.agentId === null ? workingOrder.agentId === null : cond.agentId === workingOrder.agentId;
                return statusMatch && agentMatch;
              });
              if (!matched) return { count: 0 };
            } else {
              if (where.status && workingOrder.status !== where.status) return { count: 0 };
              if (where.agentId !== undefined && workingOrder.agentId !== where.agentId) return { count: 0 };
            }

            Object.assign(workingOrder, data);
            Object.assign(orderState, data);
            return { count: 1 };
          },
          findUnique: async () => ({ ...orderState }),
        },
        orderStatusHistory: {
          create: async () => ({ id: 'hist-1' }),
        },
        notification: {
          create: async () => ({ id: 'notif-1' }),
          createMany: async () => ({ count: 1 }),
        },
        agent: {
          findUnique: async ({ where }: any) => {
            if (where.id === 'agent-1') return agent1;
            if (where.id === 'agent-2') return agent2;
            return null;
          },
          update: async ({ where, data }: any) => {
            if (where.id === 'agent-1') Object.assign(agent1, data);
            if (where.id === 'agent-2') Object.assign(agent2, data);
          },
        },
        auditLog: {
          create: async () => ({ id: 'audit-1' }),
        },
        invoice: {
          create: async ({ data }: any) => {
            orderState.invoices.push(data);
            return data;
          },
        },
        payment: {
          findFirst: async () => null,
          updateMany: async () => ({ count: 1 }),
        },
        refundAttempt: { upsert: async () => ({}) },
        refundAttemptEvent: { create: async () => ({}) },
      };

      const result = await callback(tx);
      return result;
    } finally {
      release();
    }
  };

  const adminToken = createMockToken('ADMIN', { userId: 'admin-1' });
  const customerToken = createMockToken('CUSTOMER', { userId: 'customer-user-1', customerId: 'customer-1' });
  const agent1Token = createMockToken('AGENT', { userId: 'agent-user-1', agentId: 'agent-1' });
  const agent2Token = createMockToken('AGENT', { userId: 'agent-user-2', agentId: 'agent-2' });

  const params = { params: Promise.resolve({ id: 'order-concurrency-1' }) };

  try {
    console.log('=== RUNNING CONCURRENCY & LIFECYCLE TEST SUITE ===');

    // -------------------------------------------------------------------------
    // CATEGORY 1: Invalid Order Transition Tests
    // -------------------------------------------------------------------------
    console.log('\n--- 1. Testing Invalid Transitions ---');

    // 1a: BOOKING_RECEIVED -> PICKUP_COMPLETED (Direct jump should be rejected with 400)
    assert.equal(validateStatusTransition('BOOKING_RECEIVED', 'PICKUP_COMPLETED'), false);
    orderState.status = 'BOOKING_RECEIVED';
    orderState.agentId = 'agent-1';
    const invalidJumpRes = await completeOrder(makeRequest('/api/orders/order-concurrency-1/complete', agent1Token), params);
    assert.equal(invalidJumpRes.status, 400, 'Invalid transition BOOKING_RECEIVED -> PICKUP_COMPLETED rejected with 400');
    console.log('PASS: BOOKING_RECEIVED -> PICKUP_COMPLETED rejected with 400.');

    // 1b: CANCELLED -> AGENT_ACCEPTED (Cannot accept a cancelled order)
    assert.equal(validateStatusTransition('CANCELLED', 'AGENT_ACCEPTED'), false);
    orderState.status = 'CANCELLED';
    orderState.agentId = null;
    const acceptCancelledRes = await acceptOrder(makeRequest('/api/orders/order-concurrency-1/accept', agent1Token), params);
    assert.equal(acceptCancelledRes.status, 400, 'Cannot accept CANCELLED order (400 rejected)');
    console.log('PASS: CANCELLED -> AGENT_ACCEPTED rejected with 400.');

    // 1c: PICKUP_COMPLETED -> CANCELLED (Terminal completed state cannot be cancelled, fails with 409 for Admin, 404 for Customer)
    assert.equal(validateStatusTransition('PICKUP_COMPLETED', 'CANCELLED'), false);
    orderState.status = 'PICKUP_COMPLETED';
    orderState.agentId = 'agent-1';
    const cancelCompletedAdminRes = await cancelOrder(makeRequest('/api/orders/order-concurrency-1/cancel', adminToken), params);
    assert.equal(cancelCompletedAdminRes.status, 409, 'Cannot cancel PICKUP_COMPLETED order (409 Conflict)');
    const cancelCompletedCustRes = await cancelOrder(makeRequest('/api/orders/order-concurrency-1/cancel', customerToken), params);
    assert.equal(cancelCompletedCustRes.status, 404, 'Customer cannot cancel PICKUP_COMPLETED order (404 Not Found)');
    console.log('PASS: PICKUP_COMPLETED -> CANCELLED rejected with 409/404.');

    // -------------------------------------------------------------------------
    // CATEGORY 2: Concurrent Request Race Condition Tests
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Testing Concurrent Requests ---');

    // Test A: 2 Agents simultaneously calling /api/orders/[id]/accept -> Exactly 1 receives 200, second receives 409 Conflict
    orderState.status = 'BOOKING_RECEIVED';
    orderState.agentId = null;

    const [resAgent1, resAgent2] = await Promise.all([
      acceptOrder(makeRequest('/api/orders/order-concurrency-1/accept', agent1Token), params),
      acceptOrder(makeRequest('/api/orders/order-concurrency-1/accept', agent2Token), params),
    ]);

    const acceptStatuses = [resAgent1.status, resAgent2.status].sort();
    assert.deepEqual(acceptStatuses, [200, 409], 'Test A: Exactly one agent receives 200, second receives 409 Conflict');
    assert.equal(orderState.status, 'AGENT_ACCEPTED');
    console.log('PASS: Test A (Concurrent Agent Acceptance) - Exactly one winner (200), loser gets 409 Conflict.');

    // Test B: 1 Admin assigning Agent A while Agent B calls /accept -> Atomic resolution, no dirty overwrite
    orderState.status = 'BOOKING_RECEIVED';
    orderState.agentId = null;
    agent1.status = 'AVAILABLE';
    agent2.status = 'AVAILABLE';

    const [resAdminAssign, resAgentAccept] = await Promise.all([
      assignOrder(makeRequest('/api/orders/order-concurrency-1/assign', adminToken, { agentId: 'agent-1' }), params),
      acceptOrder(makeRequest('/api/orders/order-concurrency-1/accept', agent2Token), params),
    ]);

    const assignAcceptStatuses = [resAdminAssign.status, resAgentAccept.status].sort();
    const hasWinner = assignAcceptStatuses.includes(200);
    const hasRejection = assignAcceptStatuses.includes(409) || assignAcceptStatuses.includes(400);
    assert.ok(hasWinner && hasRejection, 'Test B: Exactly one assignment operation wins; other is rejected cleanly');
    console.log('PASS: Test B (Admin Assign vs Agent Accept Race) - Clean atomic resolution, no dirty overwrite.');

    // Test C: Customer calls /cancel while Agent calls /arrive -> Cancellation wins or arrival fails gracefully; no revival
    orderState.status = 'AGENT_ON_WAY';
    orderState.agentId = 'agent-1';

    const [resCancel, resArrive] = await Promise.all([
      cancelOrder(makeRequest('/api/orders/order-concurrency-1/cancel', customerToken), params),
      arriveOrder(makeRequest('/api/orders/order-concurrency-1/arrive', agent1Token), params),
    ]);

    // Either cancel succeeds and arrive fails, or arrive succeeds and cancel is blocked/processed. Crucially, order is NEVER in corrupted state.
    assert.ok(resCancel.status === 200 || resArrive.status === 200, 'Test C: At least one operation completed safely');
    if (orderState.status === 'CANCELLED') {
      assert.equal(resArrive.status, 409, 'Arrive rejected if cancel won');
    }
    console.log(`PASS: Test C (Cancel vs Arrive Race) - Handled cleanly without order corruption. Final status: ${orderState.status}`);

    // -------------------------------------------------------------------------
    // CATEGORY 3: Idempotent Completion Retries
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Testing Idempotent Completion Retries ---');
    orderState.status = 'WEIGHING';
    orderState.agentId = 'agent-1';
    orderState.invoices = [];

    const [compRes1, compRes2] = await Promise.all([
      completeOrder(makeRequest('/api/orders/order-concurrency-1/complete', agent1Token), params),
      completeOrder(makeRequest('/api/orders/order-concurrency-1/complete', agent1Token), params),
    ]);

    assert.equal(compRes1.status, 200);
    assert.equal(compRes2.status, 200);
    assert.equal(orderState.status, 'PICKUP_COMPLETED');
    assert.equal(orderState.invoices.length, 1, 'Exactly one invoice generated despite concurrent completion requests');
    console.log('PASS: Double completion retry handled idempotently without duplicate invoices.');

    console.log('\nALL CONCURRENCY & LIFECYCLE TESTS PASSED SUCCESSFULLY.');
  } finally {
    (db.order as any).findFirst = original.orderFindFirst;
    (db.order as any).findUnique = original.orderFindUnique;
    (db.agent as any).findUnique = original.agentFindUnique;
    (db.auditLog as any).create = original.auditLogCreate;
    (db.notification as any).create = original.notificationCreate;
    (db as any).$transaction = original.transaction;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
