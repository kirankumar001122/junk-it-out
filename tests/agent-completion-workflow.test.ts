import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as completeOrder } from '../app/api/orders/[id]/complete/route';
import { POST as weighOrder } from '../app/api/orders/[id]/weigh/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { broadcaster } from '../lib/realtime';

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

async function completeOrderWithWeights(actualWeights: unknown[]) {
  const writes = {
    transactions: 0,
    itemUpdates: [] as Array<{ id: string; actualWeight: number }>,
    weightRecords: 0,
    settlements: 0,
    invoices: 0,
    orderUpdates: 0,
    agentUpdates: 0,
  };
  const orderItems = [
    { id: 'item-1', categoryId: 'cat-shared', ratePerKg: 20, estimatedWeight: 5, category: { type: 'RECYCLABLE' } },
    { id: 'item-2', categoryId: 'cat-shared', ratePerKg: 20, estimatedWeight: 5, category: { type: 'RECYCLABLE' } },
  ];

  database.order.findUnique = async () => ({
    id: 'order-weight-validation',
    orderNumber: 'JIO-WEIGHT-VALIDATION',
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
    items: orderItems,
    customer: { user: { name: 'Customer A', phone: '9999999991' } },
    agent: { userId: 'user-agent-123', user: { name: 'Agent X' } },
    address: { houseNo: '12', street: 'MG Road', area: 'Bengaluru' },
  });
  database.$transaction = async (callback: any) => {
    writes.transactions += 1;
    const transactionOrder = {
      id: 'order-weight-validation',
      orderNumber: 'JIO-WEIGHT-VALIDATION',
      agentId: 'agent-123',
      customerId: 'cust-123',
      status: 'AGENT_ARRIVED',
      paymentStatus: 'PENDING',
      invoices: [],
      items: orderItems,
    };
    return callback({
      $queryRaw: async () => [{ id: transactionOrder.id }],
      orderItem: {
        update: async ({ where, data }: any) => {
          writes.itemUpdates.push({ id: where.id, actualWeight: data.actualWeight });
          return { id: where.id, ...data };
        },
      },
      weightRecord: {
        create: async ({ data }: any) => {
          writes.weightRecords += 1;
          return { id: 'weight-record-1', ...data };
        },
      },
      settlement: {
        upsert: async ({ create }: any) => {
          writes.settlements += 1;
          return { id: 'settlement-1', ...create };
        },
      },
      order: {
        findUnique: async () => transactionOrder,
        update: async ({ data }: any) => {
          writes.orderUpdates += 1;
          writes.invoices += Number(Boolean(data.invoices?.create));
          Object.assign(transactionOrder, data);
          return {
            id: 'order-weight-validation',
            orderNumber: 'JIO-WEIGHT-VALIDATION',
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
          writes.agentUpdates += 1;
          return { id: 'agent-123', status: data.status };
        },
      },
    });
  };

  const response = await completeOrder(
    makeRequest('http://localhost:3000/api/orders/order-weight-validation/complete', {
      token: createAgentToken('agent-123'),
      body: { actualWeights },
    }),
    { params: Promise.resolve({ id: 'order-weight-validation' }) },
  );

  return { response, writes };
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

    // TEST 5: Reject duplicate, missing, and unknown order item IDs before any writes
    console.log('Test 5: Rejects incomplete or duplicate item weight mappings without writes...');
    {
      const itemWeight = (itemId: string, actualWeight: number) => ({
        itemId,
        categoryId: 'cat-shared',
        actualWeight,
      });
      const invalidPayloads = [
        [itemWeight('item-1', 4), itemWeight('item-1', 6)],
        [itemWeight('item-1', 4)],
        [itemWeight('item-1', 4), itemWeight('unknown-item', 6)],
      ];

      for (const actualWeights of invalidPayloads) {
        const { response, writes } = await completeOrderWithWeights(actualWeights);
        assert.equal(response.status, 400);
        const body = await response.json();
        assert.equal(body.error?.code, 'INVALID_WEIGH_DATA');
        assert.deepEqual(writes, {
          transactions: 0,
          itemUpdates: [],
          weightRecords: 0,
          settlements: 0,
          invoices: 0,
          orderUpdates: 0,
          agentUpdates: 0,
        });
      }
    }

    // TEST 6: Valid payload maps every item exactly once, including duplicate categories
    console.log('Test 6: Completes a valid one-to-one item weight payload...');
    {
      const { response, writes } = await completeOrderWithWeights([
        { itemId: 'item-1', categoryId: 'cat-shared', actualWeight: 4 },
        { itemId: 'item-2', categoryId: 'cat-shared', actualWeight: 6 },
      ]);
      assert.equal(response.status, 200);
      assert.deepEqual(writes.itemUpdates, [
        { id: 'item-1', actualWeight: 4 },
        { id: 'item-2', actualWeight: 6 },
      ]);
      assert.deepEqual(
        {
          transactions: writes.transactions,
          weightRecords: writes.weightRecords,
          settlements: writes.settlements,
          invoices: writes.invoices,
          orderUpdates: writes.orderUpdates,
          agentUpdates: writes.agentUpdates,
        },
        {
          transactions: 1,
          weightRecords: 1,
          settlements: 1,
          invoices: 1,
          orderUpdates: 1,
          agentUpdates: 1,
        },
      );
    }

    // TEST 7: Atomic single-request weighing and completion (JUNKITOUT_PAYS payout)
    console.log('Test 7: Atomic single-request weighing and completion (JUNKITOUT_PAYS)...');
    {
      let transactionExecuted = false;
      let recordedWeight = 0;
      let recordedScalePhoto: string | null = 'not-checked';
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
          $queryRaw: async () => [{ id: 'order-atomic-1' }],
          orderItem: {
            update: async ({ where, data }: any) => {
              recordedWeight = data.actualWeight;
              return { id: where.id, ...data };
            },
          },
          weightRecord: {
            create: async ({ data }: any) => {
              recordedScalePhoto = data.scalePhotoUrl;
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
            findUnique: async () => ({
              id: 'order-atomic-1',
              agentId: 'agent-123',
              status: 'AGENT_ARRIVED',
              paymentStatus: 'PENDING',
              invoices: [],
            }),
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
          notes: 'Doorstep weighing verified',
        },
      });

      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-atomic-1' }) });
      assert.equal(res.status, 200, 'Should complete successfully');
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(transactionExecuted, true, 'Must execute within a single transaction');
      assert.equal(recordedWeight, 10, 'Actual weight should be 10kg');
      assert.equal(recordedScalePhoto, null, 'missing scale-photo evidence must not be replaced by a stock image');
      assert.equal(settlementCreated, true, 'Settlement should be created for JUNKITOUT_PAYS');
      assert.equal(invoiceCreated, true, 'Invoice should be created');
      assert.equal(orderStatusUpdated, 'PICKUP_COMPLETED');
      assert.equal(agentStatusUpdated, 'AVAILABLE', 'Agent status must be updated to AVAILABLE');
    }

    console.log('Test 7a: Weighing stores no stock-image URL when photo evidence is absent...');
    {
      let recordedScalePhoto: string | null = 'not-checked';
      database.order.findUnique = async () => ({
        id: 'order-weigh-no-photo',
        orderNumber: 'JIO-WEIGH-NO-PHOTO',
        agentId: 'agent-123',
        customerId: 'cust-123',
        status: 'AGENT_ARRIVED',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 0,
        finalAmount: 0,
        financialDirection: 'JUNKITOUT_PAYS',
        weightRecords: [],
        items: [{
          id: 'item-no-photo',
          categoryId: 'category-no-photo',
          ratePerKg: 0,
          category: { type: 'RECYCLABLE' },
        }],
        customer: { userId: 'user-customer' },
        agent: { userId: 'user-agent-123' },
      });
      database.$transaction = async (callback: any) => callback({
        orderItem: { update: async () => ({}) },
        weightRecord: {
          create: async ({ data }: any) => {
            recordedScalePhoto = data.scalePhotoUrl;
            return { id: 'weight-no-photo', ...data };
          },
        },
        order: {
          update: async ({ data }: any) => ({
            id: 'order-weigh-no-photo',
            status: data.status,
            actualTotal: data.actualTotal,
            financialDirection: data.financialDirection,
            finalAmount: data.finalAmount,
          }),
        },
      });
      const response = await weighOrder(
        makeRequest('http://localhost:3000/api/orders/order-weigh-no-photo/weigh', {
          token: createAgentToken('agent-123'),
          body: {
            actualWeights: [{ itemId: 'item-no-photo', categoryId: 'category-no-photo', actualWeight: 5 }],
          },
        }),
        { params: Promise.resolve({ id: 'order-weigh-no-photo' }) },
      );
      assert.equal(response.status, 200);
      assert.equal(recordedScalePhoto, null);
    }

    // TEST 8: Concurrent completion requests serialize on the order row
    console.log('Test 8: Serializes concurrent completions without duplicate records...');
    {
      let orderState: any = {
        id: 'order-concurrent-complete',
        orderNumber: 'JIO-CONCURRENT-COMPLETE',
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
          { id: 'item-1', categoryId: 'cat-shared', ratePerKg: 20, category: { type: 'RECYCLABLE' } },
          { id: 'item-2', categoryId: 'cat-shared', ratePerKg: 20, category: { type: 'RECYCLABLE' } },
        ],
        customer: { user: { name: 'Customer A' } },
        agent: { userId: 'user-agent-123', user: { name: 'Agent X' } },
        address: {},
      };
      const writes = {
        lockQueries: 0,
        transactionOrderReads: 0,
        itemUpdates: 0,
        weightRecords: 0,
        settlements: 0,
        invoices: 0,
        orderUpdates: 0,
        agentUpdates: 0,
      };
      let initialReads = 0;
      let releaseInitialReads!: () => void;
      const bothInitialReads = new Promise<void>((resolve) => {
        releaseInitialReads = resolve;
      });
      let lockTail = Promise.resolve();

      database.order.findUnique = async () => {
        const snapshot = {
          ...orderState,
          status: 'AGENT_ARRIVED',
          weightRecords: [],
          invoices: [],
        };
        initialReads += 1;
        if (initialReads === 2) releaseInitialReads();
        await bothInitialReads;
        return snapshot;
      };

      database.$transaction = async (callback: any) => {
        let releaseLock: (() => void) | undefined;
        const tx = {
          $queryRaw: async (strings: TemplateStringsArray) => {
            assert.match(strings.join('?'), /FOR UPDATE/);
            writes.lockQueries += 1;
            const previous = lockTail;
            lockTail = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await previous;
            return [{ id: orderState.id }];
          },
          orderItem: {
            update: async () => {
              writes.itemUpdates += 1;
              return {};
            },
          },
          weightRecord: {
            create: async () => {
              writes.weightRecords += 1;
              return {};
            },
          },
          settlement: {
            upsert: async ({ create }: any) => {
              writes.settlements += 1;
              return create;
            },
          },
          order: {
            findUnique: async () => {
              writes.transactionOrderReads += 1;
              return {
                ...orderState,
                weightRecords: [...orderState.weightRecords],
                invoices: [...orderState.invoices],
              };
            },
            update: async ({ data }: any) => {
              writes.orderUpdates += 1;
              orderState = {
                ...orderState,
                ...data,
                invoices: data.invoices?.create
                  ? [...orderState.invoices, data.invoices.create]
                  : orderState.invoices,
              };
              writes.invoices += Number(Boolean(data.invoices?.create));
              orderState.weightRecords = writes.weightRecords
                ? [{ id: 'weight-record-1' }]
                : orderState.weightRecords;
              return { ...orderState };
            },
          },
          agent: {
            update: async () => {
              writes.agentUpdates += 1;
              return {};
            },
          },
        };

        try {
          return await callback(tx);
        } finally {
          releaseLock?.();
        }
      };

      const request = () => makeRequest(
        'http://localhost:3000/api/orders/order-concurrent-complete/complete',
        {
          token: createAgentToken('agent-123'),
          body: {
            actualWeights: [
              { itemId: 'item-1', categoryId: 'cat-shared', actualWeight: 4 },
              { itemId: 'item-2', categoryId: 'cat-shared', actualWeight: 6 },
            ],
          },
        },
      );
      const completionEvents: string[] = [];
      const unsubscribe = broadcaster.subscribe((message) => {
        if (message.payload?.id === orderState.id || message.payload?.orderId === orderState.id) {
          completionEvents.push(message.event);
        }
      });
      const responses = await Promise.all([
        completeOrder(request(), { params: Promise.resolve({ id: orderState.id }) }),
        completeOrder(request(), { params: Promise.resolve({ id: orderState.id }) }),
      ]).finally(unsubscribe);

      assert.deepEqual(responses.map((response) => response.status), [200, 200]);
      assert.equal(writes.lockQueries, 2);
      assert.equal(writes.transactionOrderReads, 2);
      assert.equal(writes.itemUpdates, 2);
      assert.equal(writes.weightRecords, 1);
      assert.equal(writes.settlements, 1);
      assert.equal(writes.invoices, 1);
      assert.equal(writes.orderUpdates, 1);
      assert.equal(writes.agentUpdates, 1);
      assert.equal(orderState.status, 'PICKUP_COMPLETED');
      assert.deepEqual(completionEvents, ['ORDER_UPDATED', 'ORDER_COMPLETED', 'WEIGHING_STARTED']);
    }

    // TEST 9: Idempotent repeat call on completed order
    console.log('Test 9: Idempotency check on already completed order...');
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

    // TEST 10: Legacy completion (pre-weighed order completing with empty body)
    console.log('Test 10: Legacy completion flow (order pre-weighed, completing with empty body)...');
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
          $queryRaw: async () => [{ id: 'order-preweighed-1' }],
          order: {
            findUnique: async () => ({
              id: 'order-preweighed-1',
              agentId: 'agent-123',
              status: 'WEIGHING',
              paymentStatus: 'SETTLEMENT_PENDING',
              invoices: [],
            }),
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
