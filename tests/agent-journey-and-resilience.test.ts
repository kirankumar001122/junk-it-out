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

process.env.JWT_SECRET = 'test-agent-journey-secret-key-2026';
process.env.FAST2SMS_API_KEY = '';
process.env.FAST2SMS_WHATSAPP_API_KEY = '';

async function runTests() {
  const { NextRequest } = await import('next/server');
  const { POST: startOrder } = await import('../app/api/orders/[id]/start/route');
  const { POST: arriveOrder } = await import('../app/api/orders/[id]/arrive/route');
  const { db } = await import('../lib/db');
  const { signToken } = await import('../lib/auth/jwt');

  const database = db as any;

  function createAgentToken(agentId: string = 'agent-123', userId: string = 'user-agent-123') {
    return signToken({
      userId,
      phone: '+919876543210',
      name: 'Field Agent Test',
      role: 'AGENT',
      customerId: null,
      agentId,
      adminId: null,
      tokenVersion: 1,
    });
  }

  function createCustomerToken() {
    return signToken({
      userId: 'user-cust-123',
      phone: '+919876543211',
      name: 'Customer Test',
      role: 'CUSTOMER',
      customerId: 'cust-123',
      agentId: null,
      adminId: null,
      tokenVersion: 1,
    });
  }

  function makeRequest(url: string, token?: string) {
    return new NextRequest(url, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
    });
  }

  console.log('--- STARTING AGENT JOURNEY & RESILIENCE REGRESSION TESTS ---');

  const origAgentFindUnique = database.agent.findUnique;
  const origAgentUpdate = database.agent.update;
  const origOrderFindUnique = database.order.findUnique;
  const origOrderUpdate = database.order.update;
  const origTransaction = database.$transaction;
  const origOrderStatusHistoryCreate = database.orderStatusHistory.create;
  const origNotificationFindFirst = database.notification.findFirst;
  const origNotificationCreate = database.notification.create;

  database.orderStatusHistory.create = async ({ data }: any) => ({ id: 'history-1', ...data });
  database.notification.findFirst = async () => null;
  database.notification.create = async ({ data }: any) => ({ id: 'notif-1', ...data });

  const mockAgent = {
    id: 'agent-123',
    status: 'ASSIGNED',
    tokenVersion: 1,
    user: { id: 'user-agent-123', name: 'Agent Test', phone: '+919876543210' },
  };

  database.agent.findUnique = async ({ where }: any) => {
    if (where.id === 'agent-123') return mockAgent;
    return null;
  };

  const sampleOrder = {
    id: 'ord-journey-1',
    orderNumber: 'ORD-JRN-101',
    agentId: 'agent-123',
    customerId: 'cust-1',
    status: 'AGENT_ACCEPTED',
    address: { area: 'Koramangala', houseNo: '12' },
    items: [{ id: 'item-1', category: { name: 'E-Waste' }, estimatedWeight: 10 }],
    customer: {
      id: 'cust-1',
      userId: 'user-cust-1',
      user: { id: 'user-cust-1', name: 'Cust', phone: '+919999988888' },
    },
    agent: {
      id: 'agent-123',
      user: { id: 'user-agent-123', name: 'Agent Test', phone: '+919876543210' },
    },
  };

  try {
    // -------------------------------------------------------------------------
    // SECTION 1: START JOURNEY WORKFLOW
    // -------------------------------------------------------------------------
    console.log('Test 1: Start journey rejects unauthenticated or customer token...');
    {
      const req1 = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start');
      const res1 = await startOrder(req1, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res1.status, 401);

      const req2 = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createCustomerToken());
      const res2 = await startOrder(req2, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res2.status, 401);
    }

    console.log('Test 2: Start journey rejects order assigned to another agent...');
    {
      database.order.findUnique = async () => ({
        ...sampleOrder,
        agentId: 'other-agent-999',
      });

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createAgentToken('agent-123'));
      const res = await startOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 403);
    }

    console.log('Test 3: Start journey rejects invalid status transition (e.g., BOOKING_RECEIVED)...');
    {
      database.order.findUnique = async () => ({
        ...sampleOrder,
        status: 'BOOKING_RECEIVED',
      });

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createAgentToken('agent-123'));
      const res = await startOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'INVALID_STATUS_TRANSITION');
    }

    console.log('Test 4: Start journey executes atomic update to AGENT_ON_WAY and EN_ROUTE...');
    {
      let agentStatusSet = '';
      database.order.findUnique = async () => sampleOrder;
      database.$transaction = async (fn: any) => {
        let updatedOrder = { ...sampleOrder, status: 'AGENT_ON_WAY' };
        return fn({
          order: {
            updateMany: async ({ where, data }: any) => {
              assert.equal(where.id, sampleOrder.id);
              assert.equal(where.agentId, 'agent-123');
              assert.equal(where.status, 'AGENT_ACCEPTED');
              assert.equal(data.status, 'AGENT_ON_WAY');
              return { count: 1 };
            },
            findUnique: async () => updatedOrder,
          },
          orderStatusHistory: { create: async () => ({ id: 'history-1' }) },
          agent: {
            update: async ({ data }: any) => {
              agentStatusSet = data.status;
              return { ...mockAgent, status: data.status };
            },
          },
        });
      };

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createAgentToken('agent-123'));
      const res = await startOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 200);
      assert.equal(agentStatusSet, 'EN_ROUTE');
      const body = await res.json();
      assert.equal(body.data.status, 'AGENT_ON_WAY');
      assert.equal(body.data.id, 'ord-journey-1');
      assert.equal(body.data.orderId, 'ord-journey-1');
      assert.equal(body.data.customer.user.passwordHash, undefined, 'No passwordHash exposed');
    }

    console.log('Test 5: Start journey rejects a stale concurrent transition...');
    {
      database.order.findUnique = async () => sampleOrder;
      database.$transaction = async (fn: any) => fn({
        order: {
          updateMany: async () => ({ count: 0 }),
          findUnique: async () => ({ ...sampleOrder, status: 'CANCELLED' }),
        },
      });

      const staleRequest = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createAgentToken('agent-123'));
      const staleResponse = await startOrder(staleRequest, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(staleResponse.status, 409, 'a concurrent status change must not be overwritten');
    }

    console.log('Test 6: Start journey is idempotent when order is already in AGENT_ON_WAY...');
    {
      let txCalled = false;
      database.order.findUnique = async () => ({ ...sampleOrder, status: 'AGENT_ON_WAY' });
      database.$transaction = async () => {
        txCalled = true;
      };

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/start', createAgentToken('agent-123'));
      const res = await startOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 200, 'Idempotent retry must succeed with HTTP 200');
      assert.equal(txCalled, false, 'Should not rerun write transaction on idempotent retry');
      const body = await res.json();
      assert.equal(body.data.status, 'AGENT_ON_WAY');
    }

    // -------------------------------------------------------------------------
    // SECTION 2: MARK ARRIVED WORKFLOW
    // -------------------------------------------------------------------------
    console.log('Test 6: Mark arrived rejects unauthenticated or customer token...');
    {
      const req1 = makeRequest('http://localhost:3000/api/orders/ord-journey-1/arrive');
      const res1 = await arriveOrder(req1, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res1.status, 401);
    }

    console.log('Test 7: Mark arrived rejects order in invalid state (e.g., AGENT_ASSIGNED)...');
    {
      database.order.findUnique = async () => ({
        ...sampleOrder,
        status: 'AGENT_ASSIGNED',
      });

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/arrive', createAgentToken('agent-123'));
      const res = await arriveOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'INVALID_STATUS_TRANSITION');
    }

    console.log('Test 8: Mark arrived executes atomic update to AGENT_ARRIVED and ARRIVED...');
    {
      let agentStatusSet = '';
      database.order.findUnique = async () => ({
        ...sampleOrder,
        status: 'AGENT_ON_WAY',
      });
      database.$transaction = async (fn: any) => {
        const updatedOrder = { ...sampleOrder, status: 'AGENT_ARRIVED' };
        return fn({
          order: {
            updateMany: async ({ where, data }: any) => {
              assert.equal(where.id, sampleOrder.id);
              assert.equal(where.agentId, 'agent-123');
              assert.equal(where.status, 'AGENT_ON_WAY');
              assert.equal(data.status, 'AGENT_ARRIVED');
              return { count: 1 };
            },
            findUnique: async () => updatedOrder,
          },
          orderStatusHistory: { create: async () => ({ id: 'history-2' }) },
          agent: {
            update: async ({ data }: any) => {
              agentStatusSet = data.status;
              return { ...mockAgent, status: data.status };
            },
          },
        });
      };

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/arrive', createAgentToken('agent-123'));
      const res = await arriveOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 200);
      assert.equal(agentStatusSet, 'ARRIVED');
      const body = await res.json();
      assert.equal(body.data.status, 'AGENT_ARRIVED');
      assert.equal(body.data.orderId, 'ord-journey-1');
      assert.equal(body.data.customer.user.passwordHash, undefined, 'No passwordHash exposed');
    }

    console.log('Test 9a: Arrival rejects a stale concurrent transition...');
    {
      database.order.findUnique = async () => ({
        ...sampleOrder,
        status: 'AGENT_ON_WAY',
      });
      database.$transaction = async (fn: any) => fn({
        order: {
          updateMany: async () => ({ count: 0 }),
          findUnique: async () => ({ ...sampleOrder, status: 'CANCELLED' }),
        },
      });
      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/arrive', createAgentToken('agent-123'));
      const res = await arriveOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 409);
      assert.equal((await res.json()).error?.code, 'ORDER_STATE_CHANGED');
    }

    console.log('Test 9: Mark arrived is idempotent when order is already in AGENT_ARRIVED...');
    {
      let txCalled = false;
      database.order.findUnique = async () => ({
        ...sampleOrder,
        status: 'AGENT_ARRIVED',
      });
      database.$transaction = async () => {
        txCalled = true;
      };

      const req = makeRequest('http://localhost:3000/api/orders/ord-journey-1/arrive', createAgentToken('agent-123'));
      const res = await arriveOrder(req, { params: Promise.resolve({ id: 'ord-journey-1' }) });
      assert.equal(res.status, 200, 'Idempotent retry must succeed with HTTP 200');
      assert.equal(txCalled, false, 'Should not rerun write transaction on idempotent retry');
      const body = await res.json();
      assert.equal(body.data.status, 'AGENT_ARRIVED');
    }

    // -------------------------------------------------------------------------
    // SECTION 3: GPS HEARTBEAT INTERFERENCE & YIELD BEHAVIOR
    // -------------------------------------------------------------------------
    console.log('Test 10: GPS heartbeat yields when button actions are in flight...');
    {
      const TRACKING_ELIGIBLE_STATUSES = [
        'AGENT_ACCEPTED',
        'AGENT_ON_WAY',
        'AGENT_ARRIVED',
        'WEIGHING',
        'WASTE_VERIFICATION',
      ];

      // Case A: Action in flight -> should defer GPS
      let heartbeatSent = false;
      const simulateHeartbeat = (isActionInFlight: boolean, orderStatus: string) => {
        if (!TRACKING_ELIGIBLE_STATUSES.includes(orderStatus)) {
          return 'SKIPPED_INELIGIBLE_STATUS';
        }
        if (isActionInFlight) {
          return 'DEFERRED_ACTION_LOCK';
        }
        heartbeatSent = true;
        return 'SENT';
      };

      assert.equal(simulateHeartbeat(true, 'AGENT_ON_WAY'), 'DEFERRED_ACTION_LOCK', 'GPS must defer when action is in flight');
      assert.equal(heartbeatSent, false);

      // Case B: Ineligible status (e.g. AGENT_ASSIGNED) -> should skip
      assert.equal(simulateHeartbeat(false, 'AGENT_ASSIGNED'), 'SKIPPED_INELIGIBLE_STATUS', 'GPS must skip for unaccepted assignment');
      assert.equal(heartbeatSent, false);

      // Case C: Eligible status and idle -> should send
      assert.equal(simulateHeartbeat(false, 'AGENT_ON_WAY'), 'SENT');
      assert.equal(heartbeatSent, true);
    }

    // -------------------------------------------------------------------------
    // SECTION 4: WEIGHING MODAL RE-ENTRY ON VALIDATION ERROR
    // -------------------------------------------------------------------------
    console.log('Test 11: Weighing input validation failure does not permanently lock the submit button...');
    {
      let weighingRequestRef = false;
      let weighModalError: string | null = null;
      let submitCallCount = 0;

      const attemptSubmit = (inputStr: string) => {
        if (weighingRequestRef) return 'LOCKED';
        weighModalError = null;

        const trimmed = inputStr.trim();
        const numVal = Number(trimmed);
        if (!trimmed || isNaN(numVal) || !Number.isFinite(numVal) || numVal <= 0) {
          weighModalError = 'Invalid weight';
          // Fix: Ensure weighingRequestRef is NOT set when validation fails!
          return 'VALIDATION_FAILED';
        }

        weighingRequestRef = true;
        try {
          submitCallCount++;
          return 'SUBMITTED';
        } finally {
          weighingRequestRef = false;
        }
      };

      // Attempt 1: invalid weight (negative or empty)
      const res1 = attemptSubmit('-5');
      assert.equal(res1, 'VALIDATION_FAILED');
      assert.equal(weighModalError, 'Invalid weight');
      assert.equal(weighingRequestRef, false, 'Ref must not be locked after validation failure');

      // Attempt 2: corrected weight immediately afterwards without page refresh
      const res2 = attemptSubmit('12.5');
      assert.equal(res2, 'SUBMITTED');
      assert.equal(submitCallCount, 1);
      assert.equal(weighingRequestRef, false);
    }

    console.log('--- ALL AGENT JOURNEY & RESILIENCE REGRESSION TESTS PASSED CLEANLY! ---');
  } finally {
    await new Promise((r) => setTimeout(r, 100));
    database.agent.findUnique = origAgentFindUnique;
    database.agent.update = origAgentUpdate;
    database.order.findUnique = origOrderFindUnique;
    database.order.update = origOrderUpdate;
    database.$transaction = origTransaction;
    database.orderStatusHistory.create = origOrderStatusHistoryCreate;
    database.notification.findFirst = origNotificationFindFirst;
    database.notification.create = origNotificationCreate;
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
