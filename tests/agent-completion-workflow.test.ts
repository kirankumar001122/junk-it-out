import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as completeOrder } from '../app/api/orders/[id]/complete/route';
import { POST as weighOrder } from '../app/api/orders/[id]/weigh/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'test-agent-completion-secret-key-2026';

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

function makeRequest(
  url: string,
  options: {
    token?: string;
    body?: Record<string, unknown>;
  } = {}
) {
  return new NextRequest(url, {
    method: 'POST',
    headers: {
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function runTests() {
  console.log('--- STARTING AGENT COMPLETION & WEIGHING WORKFLOW TESTS ---');

  const origAgentFindUnique = database.agent.findUnique;
  const origOrderFindUnique = database.order.findUnique;
  const origTransaction = database.$transaction;

  // Mock agent tokenVersion check for middleware
  database.agent.findUnique = async ({ where }: any) => {
    return { id: where.id, tokenVersion: 1 };
  };

  try {
    // TEST 1: Reject unauthenticated or customer request
    console.log('Test 1: Rejects customer or unauthenticated request...');
    {
      const req = makeRequest('http://localhost:3000/api/orders/order-1/complete', {
        token: createCustomerToken(),
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 401, 'Should return 401 for non-agent role');
    }

    // TEST 2: Rejects order assigned to another agent
    console.log('Test 2: Rejects order assigned to a different agent...');
    {
      database.order.findUnique = async () => ({
        id: 'order-1',
        agentId: 'other-agent',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        invoices: [],
        items: [],
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-1/complete', {
        token: createAgentToken('agent-123'),
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 403, 'Should return 403 when agent does not own the order');
    }

    // TEST 3: Rejects invalid weights in unified completion
    console.log('Test 3: Rejects invalid weights in unified payload...');
    {
      database.order.findUnique = async () => ({
        id: 'order-1',
        agentId: 'agent-123',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        invoices: [],
        items: [{ id: 'item-1', categoryId: 'cat-1', ratePerKg: 15, category: { type: 'RECYCLABLE' } }],
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-1/complete', {
        token: createAgentToken('agent-123'),
        body: {
          actualWeights: [{ itemId: 'item-1', categoryId: 'cat-1', actualWeight: -5 }],
        },
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 400, 'Should reject non-positive weight');
      const body = await res.json();
      assert.equal(body.error?.code, 'INVALID_WEIGH_DATA');
    }

    // TEST 4: Rejects completion when no weightRecords and no actualWeights payload
    console.log('Test 4: Rejects completion without weights on unweighed order...');
    {
      database.order.findUnique = async () => ({
        id: 'order-1',
        agentId: 'agent-123',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        invoices: [],
        items: [{ id: 'item-1', categoryId: 'cat-1', ratePerKg: 15 }],
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-1/complete', {
        token: createAgentToken('agent-123'),
        body: {},
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 400, 'Should return 400 WEIGHING_REQUIRED');
      const body = await res.json();
      assert.equal(body.error?.code, 'WEIGHING_REQUIRED');
    }

    // TEST 5: Atomic single-request weighing and completion (JUNKITOUT_PAYS payout)
    console.log('Test 5: Atomic single-request weighing and completion (JUNKITOUT_PAYS)...');
    {
      let transactionExecuted = false;
      let recordedWeight = 0;
      let settlementCreated = false;
      let invoiceCreated = false;
      let orderStatusUpdated = '';
      let agentStatusUpdated = '';

      database.order.findUnique = async () => ({
        id: 'order-atomic-1',
        orderNumber: 'JIO-ATOMIC-01',
        agentId: 'agent-123',
        customerId: 'cust-123',
        status: 'AGENT_ARRIVED',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 0,
        finalAmount: 0,
        financialDirection: 'CUSTOMER_PAYS',
        paymentStatus: 'PENDING',
        weightRecords: [],
        invoices: [],
        items: [
          { id: 'item-1', categoryId: 'cat-metal', ratePerKg: 20, estimatedWeight: 5, category: { type: 'RECYCLABLE' } },
        ],
        customer: { user: { name: 'Customer A', phone: '9999999991' } },
        agent: { userId: 'user-agent-123', user: { name: 'Agent X' } },
        address: { houseNo: '12', street: 'MG Road', area: 'Bengaluru' },
      });

      database.$transaction = async (callback: any) => {
        transactionExecuted = true;
        const tx = {
          orderItem: {
            update: async ({ where, data }: any) => {
              recordedWeight = data.actualWeight;
              return { id: where.id, ...data };
            },
          },
          weightRecord: {
            create: async ({ data }: any) => {
              return { id: 'w-rec-1', ...data };
            },
          },
          settlement: {
            upsert: async ({ create }: any) => {
              settlementCreated = true;
              assert.equal(create.amount, 200, '200 = 10kg * 20/kg rate');
              return { id: 'settle-1', ...create };
            },
          },
          order: {
            update: async ({ data }: any) => {
              orderStatusUpdated = data.status;
              if (data.invoices?.create) {
                invoiceCreated = true;
                assert.equal(data.invoices.create.totalAmount, 200);
              }
              return {
                id: 'order-atomic-1',
                orderNumber: 'JIO-ATOMIC-01',
                agentId: 'agent-123',
                status: data.status,
                actualTotal: data.actualTotal,
                financialDirection: data.financialDirection,
                finalAmount: data.finalAmount,
                paymentStatus: data.paymentStatus,
              };
            },
          },
          agent: {
            update: async ({ data }: any) => {
              agentStatusUpdated = data.status;
              return { id: 'agent-123', status: data.status };
            },
          },
        };
        return callback(tx);
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-atomic-1/complete', {
        token: createAgentToken('agent-123'),
        body: {
          actualWeights: [{ itemId: 'item-1', categoryId: 'cat-metal', actualWeight: 10 }],
          scalePhotoUrl: 'https://example.com/scale.jpg',
          notes: 'Doorstep weighing verified',
        },
      });

      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-atomic-1' }) });
      assert.equal(res.status, 200, 'Should complete successfully');
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(transactionExecuted, true, 'Must execute within a single transaction');
      assert.equal(recordedWeight, 10, 'Actual weight should be 10kg');
      assert.equal(settlementCreated, true, 'Settlement should be created for JUNKITOUT_PAYS');
      assert.equal(invoiceCreated, true, 'Invoice should be created');
      assert.equal(orderStatusUpdated, 'PICKUP_COMPLETED');
      assert.equal(agentStatusUpdated, 'AVAILABLE', 'Agent status must be updated to AVAILABLE');
    }

    // TEST 6: Idempotent repeat call on completed order
    console.log('Test 6: Idempotency check on already completed order...');
    {
      database.order.findUnique = async () => ({
        id: 'order-completed-1',
        agentId: 'agent-123',
        status: 'PICKUP_COMPLETED',
        weightRecords: [{ id: 'w-1' }],
        invoices: [{ id: 'inv-1' }],
        items: [],
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-completed-1/complete', {
        token: createAgentToken('agent-123'),
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-completed-1' }) });
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.meta?.message, 'Order was already completed.');
    }

    // TEST 7: Legacy completion (pre-weighed order completing with empty body)
    console.log('Test 7: Legacy completion flow (order pre-weighed, completing with empty body)...');
    {
      let invoiceCreated = false;
      let orderStatusUpdated = '';

      database.order.findUnique = async () => ({
        id: 'order-preweighed-1',
        orderNumber: 'JIO-PREWEIGHED-01',
        agentId: 'agent-123',
        customerId: 'cust-123',
        status: 'WEIGHING',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 100,
        finalAmount: 100,
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'SETTLEMENT_PENDING',
        weightRecords: [{ id: 'w-existing-1', createdAt: new Date() }],
        invoices: [],
        items: [{ id: 'item-1', actualWeight: 5, ratePerKg: 20 }],
        customer: { user: { name: 'Customer B' } },
        agent: { userId: 'user-agent-123' },
      });

      database.$transaction = async (callback: any) => {
        const tx = {
          order: {
            update: async ({ data }: any) => {
              orderStatusUpdated = data.status;
              invoiceCreated = Boolean(data.invoices?.create);
              return { id: 'order-preweighed-1', status: data.status };
            },
          },
          agent: {
            update: async ({ data }: any) => ({ id: 'agent-123', status: data.status }),
          },
        };
        return callback(tx);
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-preweighed-1/complete', {
        token: createAgentToken('agent-123'),
        body: {},
      });

      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-preweighed-1' }) });
      assert.equal(res.status, 200);
      assert.equal(orderStatusUpdated, 'PICKUP_COMPLETED');
      assert.equal(invoiceCreated, true);
    }

    console.log('ALL AGENT COMPLETION & WEIGHING WORKFLOW TESTS PASSED CLEANLY.');
  } finally {
    database.agent.findUnique = origAgentFindUnique;
    database.order.findUnique = origOrderFindUnique;
    database.$transaction = origTransaction;
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
