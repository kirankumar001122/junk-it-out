import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { PATCH as updateStatus } from '../app/api/agent/status/route';
import { reconcileUndispatchedPaidOrders } from '../lib/payments/dispatchRecovery';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'test-agent-status-secret-key-2026';

const database = db as any;

function createAgentToken(agentId: string = 'agent-stat-1', userId: string = 'user-stat-1') {
  return signToken({
    userId,
    phone: '+919876543210',
    name: 'Status Test Agent',
    role: 'AGENT',
    customerId: null,
    agentId,
    adminId: null,
    tokenVersion: 1,
  });
}

function makeStatusRequest(status: string, token: string = createAgentToken()) {
  return new NextRequest('http://localhost:3000/api/agent/status', {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ status }),
  });
}

async function runTests() {
  console.log('--- STARTING AGENT STATUS & DISPATCH RECOVERY TESTS ---');

  const origAgentFindUnique = database.agent.findUnique;
  const origAgentUpdate = database.agent.update;
  const origOrderFindFirst = database.order.findFirst;
  const origOrderFindMany = database.order.findMany;
  const origOrderFindUnique = database.order.findUnique;
  const origRefundFindFirst = database.refundAttempt.findFirst;
  const origTransaction = database.$transaction;

  // Mock agent tokenVersion check for middleware
  database.agent.findUnique = async ({ where }: any) => {
    return { id: where.id, tokenVersion: 1 };
  };

  try {
    // -------------------------------------------------------------
    // TEST 1: Rejects unauthorized callers (non-agents)
    // -------------------------------------------------------------
    console.log('Test 1: Rejects unauthorized customer token...');
    {
      const customerToken = signToken({
        userId: 'user-c',
        phone: '+919999999999',
        name: 'Customer',
        role: 'CUSTOMER',
        customerId: 'c-1',
      });
      const req = makeStatusRequest('AVAILABLE', customerToken);
      const res = await updateStatus(req);
      assert.equal(res.status, 403);
    }

    // -------------------------------------------------------------
    // TEST 2: Rejects invalid status values
    // -------------------------------------------------------------
    console.log('Test 2: Rejects invalid status values...');
    {
      const req = makeStatusRequest('INVALID_STATUS');
      const res = await updateStatus(req);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'INVALID_STATUS');
    }

    // -------------------------------------------------------------
    // TEST 3: Conflict 409 when agent attempts AVAILABLE with active order
    // -------------------------------------------------------------
    console.log('Test 3: Prevents switching to AVAILABLE when agent has active pickup...');
    {
      database.$transaction = async (callback: any) => {
        const tx = {
          order: {
            findFirst: async () => ({ id: 'active-ord-1' }),
          },
          agent: {
            update: async () => ({ id: 'agent-stat-1', status: 'AVAILABLE' }),
          },
        };
        return callback(tx);
      };

      const req = makeStatusRequest('AVAILABLE');
      const res = await updateStatus(req);
      assert.equal(res.status, 409, 'Must return 409 conflict when active order in progress');
      const body = await res.json();
      assert.equal(body.error?.code, 'AGENT_HAS_ACTIVE_ORDER');
    }

    // -------------------------------------------------------------
    // TEST 4: Successful toggle to OFFLINE
    // -------------------------------------------------------------
    console.log('Test 4: Successfully toggles status to OFFLINE...');
    {
      database.$transaction = async (callback: any) => {
        const tx = {
          order: { findFirst: async () => null },
          agent: {
            update: async ({ data }: any) => ({
              id: 'agent-stat-1',
              status: data.status,
              user: { name: 'Status Test Agent' },
            }),
          },
        };
        return callback(tx);
      };

      const req = makeStatusRequest('OFFLINE');
      const res = await updateStatus(req);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data?.status, 'OFFLINE');
    }

    // -------------------------------------------------------------
    // TEST 5: Batched serviceAreas matching in reconcileUndispatchedPaidOrders
    // -------------------------------------------------------------
    console.log('Test 5: Batched serviceAreas query executes in single query...');
    {
      let capturedWhere: any = null;
      database.order.findMany = async ({ where }: any) => {
        capturedWhere = where;
        return [];
      };

      const summary = await reconcileUndispatchedPaidOrders({
        serviceAreas: ['JP Nagar', 'Jayanagar', 'Koramangala'],
      });

      assert.equal(summary.scanned, 0);
      assert.deepEqual(capturedWhere.address.area, { in: ['JP Nagar', 'Jayanagar', 'Koramangala'] });
    }

    // -------------------------------------------------------------
    // TEST 6: Single serviceArea backward compatibility
    // -------------------------------------------------------------
    console.log('Test 6: Single serviceArea query continues to work...');
    {
      let capturedWhere: any = null;
      database.order.findMany = async ({ where }: any) => {
        capturedWhere = where;
        return [];
      };

      const summary = await reconcileUndispatchedPaidOrders({
        serviceArea: 'Indiranagar',
      });

      assert.equal(summary.scanned, 0);
      assert.equal(capturedWhere.address.area, 'Indiranagar');
    }

    // -------------------------------------------------------------
    // TEST 7: Successful toggle to AVAILABLE runs single batched dispatch scan
    // -------------------------------------------------------------
    console.log('Test 7: Toggling to AVAILABLE triggers single batched dispatch scan without loop...');
    {
      let findManyCallCount = 0;
      let searchedAreas: any = null;

      database.$transaction = async (callback: any) => {
        const tx = {
          order: { findFirst: async () => null },
          agent: {
            update: async ({ data }: any) => ({
              id: 'agent-stat-1',
              status: data.status,
              serviceAreas: 'JP Nagar, Jayanagar, Koramangala',
              user: { name: 'Status Test Agent' },
            }),
          },
        };
        return callback(tx);
      };

      database.order.findMany = async ({ where }: any) => {
        findManyCallCount += 1;
        searchedAreas = where?.address?.area;
        return [];
      };

      const req = makeStatusRequest('AVAILABLE');
      const res = await updateStatus(req);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data?.status, 'AVAILABLE');

      // CRITICAL ASSERTION: exactly 1 findMany call was made, NOT 3 sequential calls!
      assert.equal(findManyCallCount, 1, 'Must execute exactly 1 batched query across all service areas');
      assert.deepEqual(searchedAreas, { in: ['JP Nagar', 'Jayanagar', 'Koramangala'] });
    }

    // -------------------------------------------------------------
    // TEST 8: All areas ('all') triggers scan without area restriction
    // -------------------------------------------------------------
    console.log('Test 8: Agent serving "all" areas scans without area restriction...');
    {
      let searchedWhere: any = null;

      database.$transaction = async (callback: any) => {
        const tx = {
          order: { findFirst: async () => null },
          agent: {
            update: async ({ data }: any) => ({
              id: 'agent-stat-1',
              status: data.status,
              serviceAreas: 'all',
              user: { name: 'Global Agent' },
            }),
          },
        };
        return callback(tx);
      };

      database.order.findMany = async ({ where }: any) => {
        searchedWhere = where;
        return [];
      };

      const req = makeStatusRequest('AVAILABLE');
      const res = await updateStatus(req);
      assert.equal(res.status, 200);
      assert.equal(searchedWhere.address?.area, undefined, 'Must not restrict area when agent serves all');
    }

    console.log('ALL AGENT STATUS & DISPATCH RECOVERY TESTS PASSED CLEANLY.');
  } finally {
    database.agent.findUnique = origAgentFindUnique;
    database.agent.update = origAgentUpdate;
    database.order.findFirst = origOrderFindFirst;
    database.order.findMany = origOrderFindMany;
    database.order.findUnique = origOrderFindUnique;
    database.refundAttempt.findFirst = origRefundFindFirst;
    database.$transaction = origTransaction;
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
