import assert from 'node:assert/strict';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as weighOrder } from '../app/api/orders/[id]/weigh/route';
import { POST as completeOrder } from '../app/api/orders/[id]/complete/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'test-secret-key-weighing-rollback-2026-32bytes-secure!';

const database = db as any;

function createAgentToken(agentId: string = 'agent-test-1', userId: string = 'user-agent-1') {
  return signToken({
    userId,
    agentId,
    phone: '9876543210',
    role: 'AGENT',
    tokenVersion: 1,
  });
}

function makeRequest(url: string, options: { token?: string; body?: any } = {}) {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (options.token) {
    headers.set('authorization', `Bearer ${options.token}`);
    headers.set('cookie', `jio_token=${options.token}`);
  }
  return new NextRequest(url, {
    method: 'POST',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

describe('F03 & F14: Weighing Validation & Transaction Safety', () => {
  let origOrderFindUnique: any;
  let origAgentFindUnique: any;
  let origTransaction: any;

  beforeEach(() => {
    origOrderFindUnique = database.order.findUnique;
    origAgentFindUnique = database.agent.findUnique;
    origTransaction = database.$transaction;

    database.agent.findUnique = async () => ({ tokenVersion: 1 });
  });

  afterEach(() => {
    database.order.findUnique = origOrderFindUnique;
    database.agent.findUnique = origAgentFindUnique;
    database.$transaction = origTransaction;
  });

  describe('F03: Incomplete Weighing Validation', () => {
    it('rejects weighing when actualWeights is missing or empty array', async () => {
      database.order.findUnique = async () => ({
        id: 'order-1',
        agentId: 'agent-test-1',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        items: [{ id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } }],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-1/weigh', {
        token: createAgentToken(),
        body: { actualWeights: [] },
      });
      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-1' }) });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'INVALID_WEIGH_DATA');
    });

    it('rejects weighing when order has items but actualWeights misses an order item (incomplete)', async () => {
      database.order.findUnique = async () => ({
        id: 'order-2items',
        agentId: 'agent-test-1',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
          { id: 'item-2', categoryId: 'cat-metal', ratePerKg: 30, category: { name: 'Metal', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      // Submit weight for item-1 only, omitting item-2
      const req = makeRequest('http://localhost:3000/api/orders/order-2items/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [{ itemId: 'item-1', actualWeight: 10 }],
        },
      });
      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-2items' }) });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'INVALID_WEIGH_DATA');
      assert.match(data.error?.message, /Incomplete weighing/);
    });

    it('rejects weighing when actualWeights contains duplicate entries for the same item', async () => {
      database.order.findUnique = async () => ({
        id: 'order-dup',
        agentId: 'agent-test-1',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-dup/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [
            { itemId: 'item-1', actualWeight: 10 },
            { itemId: 'item-1', actualWeight: 12 },
          ],
        },
      });
      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-dup' }) });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'INVALID_WEIGH_DATA');
      assert.match(data.error?.message, /Each order item may only have one actual weight entry/);
    });

    it('rejects weighing when actualWeights references an item ID not in the order', async () => {
      database.order.findUnique = async () => ({
        id: 'order-foreign',
        agentId: 'agent-test-1',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        items: [
          { id: 'item-valid-1', categoryId: 'cat-paper', ratePerKg: 15, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-foreign/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [{ itemId: 'item-foreign-id', actualWeight: 10 }],
        },
      });
      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-foreign' }) });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'INVALID_WEIGH_DATA');
      assert.match(data.error?.message, /valid order item ID/);
    });

    it('rejects weighing when actualWeight is non-positive or invalid', async () => {
      database.order.findUnique = async () => ({
        id: 'order-neg',
        agentId: 'agent-test-1',
        status: 'AGENT_ARRIVED',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      for (const badWeight of [0, -5, NaN, 'ten', null]) {
        const req = makeRequest('http://localhost:3000/api/orders/order-neg/weigh', {
          token: createAgentToken(),
          body: {
            actualWeights: [{ itemId: 'item-1', actualWeight: badWeight }],
          },
        });
        const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-neg' }) });
        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.error?.code, 'INVALID_WEIGH_DATA');
      }
    });

    it('rejects completion with empty body when an order has weightRecords but unweighed items remain', async () => {
      database.order.findUnique = async () => ({
        id: 'order-partial-completion',
        orderNumber: 'JIO-PARTIAL-COMPL',
        agentId: 'agent-test-1',
        status: 'WEIGHING',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 100,
        finalAmount: 100,
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'SETTLEMENT_PENDING',
        weightRecords: [{ id: 'wr-1', createdAt: new Date() }],
        invoices: [],
        items: [
          { id: 'item-1', actualWeight: 10, ratePerKg: 20 },
          { id: 'item-2', actualWeight: null, ratePerKg: 20 }, // Unweighed item!
        ],
        customer: { user: { name: 'Customer' } },
        agent: { userId: 'user-agent-1' },
      });

      const req = makeRequest('http://localhost:3000/api/orders/order-partial-completion/complete', {
        token: createAgentToken(),
        body: {},
      });
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'order-partial-completion' }) });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error?.code, 'WEIGHING_REQUIRED');
      assert.match(data.error?.message, /All order items must have recorded scale weights/);
    });

    it('accepts weighing when all order items have valid, matching positive weights', async () => {
      let createdWeightRecord = false;
      let updatedOrderItemCount = 0;

      database.order.findUnique = async () => ({
        id: 'order-valid-weigh',
        orderNumber: 'JIO-VALID-WEIGH',
        agentId: 'agent-test-1',
        customerId: 'cust-1',
        status: 'AGENT_ARRIVED',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 0,
        finalAmount: 0,
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'SETTLEMENT_PENDING',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, estimatedWeight: 5, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
          { id: 'item-2', categoryId: 'cat-metal', ratePerKg: 30, estimatedWeight: 10, category: { name: 'Metal', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      database.$transaction = async (callback: any) => {
        const tx = {
          order: {
            updateMany: async () => ({ count: 1 }),
            findUnique: async () => ({
              id: 'order-valid-weigh',
              status: 'WEIGHING',
              actualTotal: 450,
              finalAmount: 450,
              financialDirection: 'JUNKITOUT_PAYS',
              items: [],
              weightRecords: [],
            }),
          },
          orderItem: {
            update: async () => {
              updatedOrderItemCount++;
              return {};
            },
          },
          weightRecord: {
            create: async () => {
              createdWeightRecord = true;
              return { id: 'wr-valid' };
            },
          },
          orderStatusHistory: {
            create: async () => ({}),
          },
          settlement: {
            upsert: async () => ({}),
          },
        };
        return await callback(tx);
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-valid-weigh/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [
            { itemId: 'item-1', actualWeight: 10 },
            { itemId: 'item-2', actualWeight: 10 },
          ],
        },
      });

      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-valid-weigh' }) });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(createdWeightRecord, true);
      assert.equal(updatedOrderItemCount, 2);
    });
  });

  describe('F14: Transaction Safety and Rollback on Failed Conditional Claim', () => {
    it('rolls back and commits zero writes when conditional CAS claim fails due to concurrent change', async () => {
      let itemUpdatesCount = 0;
      let weightRecordCreated = false;
      let txExecuted = false;

      database.order.findUnique = async () => ({
        id: 'order-cas-fail',
        orderNumber: 'JIO-CAS-FAIL',
        agentId: 'agent-test-1',
        customerId: 'cust-1',
        status: 'AGENT_ARRIVED',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 0,
        finalAmount: 0,
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'SETTLEMENT_PENDING',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, estimatedWeight: 5, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      database.$transaction = async (callback: any) => {
        txExecuted = true;
        const tx = {
          order: {
            // CAS updateMany returns count: 0 (e.g. order was concurrently cancelled)
            updateMany: async () => ({ count: 0 }),
            findUnique: async () => null,
          },
          orderItem: {
            update: async () => {
              itemUpdatesCount++;
              return {};
            },
          },
          weightRecord: {
            create: async () => {
              weightRecordCreated = true;
              return { id: 'wr-orphan' };
            },
          },
          orderStatusHistory: {
            create: async () => ({}),
          },
          settlement: {
            upsert: async () => ({}),
          },
        };

        // Execute the callback: if callback throws, the transaction rolls back!
        return await callback(tx);
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-cas-fail/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [{ itemId: 'item-1', actualWeight: 15 }],
        },
      });

      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-cas-fail' }) });

      // Must return HTTP 409 Conflict
      assert.equal(res.status, 409);
      const data = await res.json();
      assert.equal(data.error?.code, 'CONFLICT');

      // Crucial: Transaction threw on CAS failure, preventing subsequent writes
      assert.equal(txExecuted, true);
      assert.equal(weightRecordCreated, false, 'WeightRecord must NOT be created when CAS claim fails');
      assert.equal(itemUpdatesCount, 0, 'OrderItem updates must NOT be committed when CAS claim fails');
    });

    it('rolls back completely and returns 500 if an unexpected error occurs during transaction execution', async () => {
      let weightRecordCreated = false;

      database.order.findUnique = async () => ({
        id: 'order-tx-error',
        orderNumber: 'JIO-TX-ERROR',
        agentId: 'agent-test-1',
        customerId: 'cust-1',
        status: 'AGENT_ARRIVED',
        pickupCharge: 0,
        discountAmount: 0,
        actualTotal: 0,
        finalAmount: 0,
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'SETTLEMENT_PENDING',
        weightRecords: [],
        items: [
          { id: 'item-1', categoryId: 'cat-paper', ratePerKg: 15, estimatedWeight: 5, category: { name: 'Paper', type: 'RECYCLABLE_BUY' } },
        ],
        agent: { userId: 'user-agent-1' },
        customer: { user: { name: 'Customer' } },
      });

      database.$transaction = async (callback: any) => {
        const tx = {
          order: {
            updateMany: async () => ({ count: 1 }),
            findUnique: async () => ({ id: 'order-tx-error', status: 'WEIGHING' }),
          },
          orderItem: {
            update: async () => {
              throw new Error('Database disk error during item update');
            },
          },
          weightRecord: {
            create: async () => {
              weightRecordCreated = true;
              return { id: 'wr-1' };
            },
          },
        };
        return await callback(tx);
      };

      const req = makeRequest('http://localhost:3000/api/orders/order-tx-error/weigh', {
        token: createAgentToken(),
        body: {
          actualWeights: [{ itemId: 'item-1', actualWeight: 15 }],
        },
      });

      const res = await weighOrder(req, { params: Promise.resolve({ id: 'order-tx-error' }) });
      assert.equal(res.status, 500);
      const data = await res.json();
      assert.equal(data.error?.code, 'INTERNAL_SERVER_ERROR');
      assert.equal(weightRecordCreated, false, 'No weight record created when preceding write failed');
    });
  });
});
