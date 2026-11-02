import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'agent-accept-concurrency-test-secret';

const database = db as any;

function makeOrder(id: string, area: string = 'JP Nagar') {
  return {
    id,
    orderNumber: `JIO-${id}`,
    agentId: null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'JUNKITOUT_PAYS',
    paymentStatus: 'PENDING',
    address: { area },
    customer: { userId: 'synthetic-customer', user: { name: 'Synthetic Customer', phone: '9000000001' } },
    items: [],
  };
}

async function run() {
  const originals = {
    agentFindUnique: database.agent.findUnique,
    orderFindFirst: database.order.findFirst,
    transaction: database.$transaction,
    serviceAreaFindFirst: database.serviceArea?.findFirst,
  };

  try {
    // =========================================================================
    // SCENARIO 1: Single agent attempting to accept two orders concurrently
    // =========================================================================
    console.log('Scenario 1: Single agent accepting two orders concurrently...');
    {
      const agentId = 'single-active-agent';
      const agentUser = { id: 'single-active-user', name: 'Synthetic Agent', phone: '9000000000' };
      let agentStatus = 'AVAILABLE';
      const orders = new Map<string, any>([
        ['order-a', makeOrder('order-a')],
        ['order-b', makeOrder('order-b')],
      ]);
      let lockTail = Promise.resolve();

      database.agent.findUnique = async ({ where }: any) =>
        where.id === agentId
          ? { id: agentId, userId: agentUser.id, status: agentStatus, serviceAreas: 'JP Nagar', tokenVersion: 1, user: agentUser }
          : null;

      database.order.findFirst = async ({ where }: any) => {
        const identifier = where.OR?.[0]?.id;
        return identifier ? orders.get(identifier) || null : null;
      };

      database.$transaction = async (callback: (tx: any) => Promise<unknown>) => {
        let releaseLock: (() => void) | null = null;
        const tx = {
          $queryRaw: async () => {
            const previousLock = lockTail;
            lockTail = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await previousLock;
          },
          order: {
            findFirst: async ({ where }: any) =>
              [...orders.values()].find(
                (candidate) => candidate.agentId === where.agentId && where.status.in.includes(candidate.status)
              ) || null,
            updateMany: async ({ where, data }: any) => {
              const candidate = orders.get(where.id);
              const stateMatches = where.OR.some(
                (condition: any) =>
                  candidate?.agentId === condition.agentId && condition.status.in.includes(candidate.status)
              );
              if (!stateMatches) return { count: 0 };
              Object.assign(candidate, data);
              return { count: 1 };
            },
            findUnique: async ({ where }: any) => orders.get(where.id) || null,
          },
          orderStatusHistory: { create: async () => ({ id: 'synthetic-history' }) },
          notification: { createMany: async () => ({ count: 1 }) },
          agent: {
            findUnique: async () => ({ id: agentId, status: agentStatus }),
            update: async ({ data }: any) => {
              agentStatus = data.status;
              return { id: agentId, status: agentStatus };
            },
          },
          auditLog: { create: async () => ({ id: 'synthetic-audit' }) },
        };

        try {
          return await callback(tx);
        } finally {
          releaseLock?.();
        }
      };

      const token = signToken({
        userId: agentUser.id,
        phone: agentUser.phone,
        role: 'AGENT',
        agentId,
      });

      const responses = await Promise.all(
        ['order-a', 'order-b'].map((orderId) =>
          acceptOrder(
            new NextRequest(`http://localhost/api/orders/${orderId}/accept`, {
              method: 'POST',
              headers: { Cookie: `jio_token=${token}` },
            }),
            { params: Promise.resolve({ id: orderId }) }
          )
        )
      );

      assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      assert.equal(
        [...orders.values()].filter(
          (candidate) => candidate.agentId === agentId && candidate.status === 'AGENT_ACCEPTED'
        ).length,
        1,
        'one agent must not acquire two active orders concurrently'
      );
      console.log('✓ Scenario 1 passed: Single agent concurrency exclusivity enforced.');
    }

    // =========================================================================
    // SCENARIO 2: Two distinct agents accepting the SAME order concurrently (Race Condition)
    // =========================================================================
    console.log('Scenario 2: Two distinct agents accepting the same order concurrently...');
    {
      const orderRace = makeOrder('order-race-1', 'JP Nagar');
      const agent1Id = 'agent-race-1';
      const agent2Id = 'agent-race-2';

      const agentMap = new Map<string, any>([
        [
          agent1Id,
          {
            id: agent1Id,
            userId: 'user-race-1',
            status: 'AVAILABLE',
            serviceAreas: 'JP Nagar',
            tokenVersion: 1,
            user: { id: 'user-race-1', name: 'Agent One', phone: '9000000001' },
          },
        ],
        [
          agent2Id,
          {
            id: agent2Id,
            userId: 'user-race-2',
            status: 'AVAILABLE',
            serviceAreas: 'JP Nagar',
            tokenVersion: 1,
            user: { id: 'user-race-2', name: 'Agent Two', phone: '9000000002' },
          },
        ],
      ]);

      let raceLockTail = Promise.resolve();

      database.agent.findUnique = async ({ where }: any) => agentMap.get(where.id) || null;
      database.order.findFirst = async () => orderRace;

      database.$transaction = async (callback: (tx: any) => Promise<unknown>) => {
        let releaseLock: (() => void) | null = null;
        const tx = {
          $queryRaw: async () => {
            const prev = raceLockTail;
            raceLockTail = new Promise<void>((resolve) => {
              releaseLock = resolve;
            });
            await prev;
          },
          order: {
            findFirst: async () => null,
            updateMany: async ({ where, data }: any) => {
              // Compare-And-Swap condition: order must still be unassigned
              if (orderRace.agentId !== null) {
                return { count: 0 };
              }
              Object.assign(orderRace, data);
              return { count: 1 };
            },
            findUnique: async () => orderRace,
          },
          orderStatusHistory: { create: async () => ({ id: 'race-history' }) },
          notification: { createMany: async () => ({ count: 1 }) },
          agent: {
            findUnique: async ({ where }: any) => agentMap.get(where.id),
            update: async ({ where, data }: any) => {
              const a = agentMap.get(where.id);
              if (a) a.status = data.status;
              return a;
            },
          },
          auditLog: { create: async () => ({ id: 'race-audit' }) },
        };

        try {
          return await callback(tx);
        } finally {
          releaseLock?.();
        }
      };

      const token1 = signToken({
        userId: 'user-race-1',
        phone: '9000000001',
        role: 'AGENT',
        agentId: agent1Id,
      });

      const token2 = signToken({
        userId: 'user-race-2',
        phone: '9000000002',
        role: 'AGENT',
        agentId: agent2Id,
      });

      const req1 = new NextRequest('http://localhost/api/orders/order-race-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${token1}` },
      });

      const req2 = new NextRequest('http://localhost/api/orders/order-race-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${token2}` },
      });

      const [res1, res2] = await Promise.all([
        acceptOrder(req1, { params: Promise.resolve({ id: 'order-race-1' }) }),
        acceptOrder(req2, { params: Promise.resolve({ id: 'order-race-1' }) }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      assert.deepEqual(statuses, [200, 409], 'Exactly one agent must win the race; the second receives 409');
      assert.equal(orderRace.status, 'AGENT_ACCEPTED');
      assert.ok(orderRace.agentId === agent1Id || orderRace.agentId === agent2Id);

      const conflictRes = res1.status === 409 ? res1 : res2;
      const conflictBody = await conflictRes.json();
      assert.equal(conflictBody.error?.code, 'CONFLICT');
      console.log('✓ Scenario 2 passed: Atomic CAS prevents double-acceptance race condition.');
    }

    // =========================================================================
    // SCENARIO 3: Agent with active pickup in progress rejected with 409 AGENT_HAS_ACTIVE_ORDER
    // =========================================================================
    console.log('Scenario 3: Agent with active pickup in progress rejected with 409...');
    {
      const agentId = 'busy-agent';
      const orderNew = makeOrder('order-new-1', 'JP Nagar');

      database.agent.findUnique = async () => ({
        id: agentId,
        status: 'ASSIGNED',
        serviceAreas: 'all',
        tokenVersion: 1,
        user: { name: 'Busy Agent', phone: '9000000003' },
      });

      database.order.findFirst = async () => orderNew;

      const token = signToken({
        userId: 'user-busy',
        phone: '9000000003',
        role: 'AGENT',
        agentId,
      });

      const req = new NextRequest('http://localhost/api/orders/order-new-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${token}` },
      });

      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-new-1' }) });
      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.error?.code, 'AGENT_HAS_ACTIVE_ORDER');
      console.log('✓ Scenario 3 passed: Busy agent blocked with AGENT_HAS_ACTIVE_ORDER.');
    }

    // =========================================================================
    // SCENARIO 4: Suspended or Deactivated Agent Rejected with 403 FORBIDDEN
    // =========================================================================
    console.log('Scenario 4: Suspended or deactivated agent rejected with 403...');
    {
      for (const badStatus of ['SUSPENDED', 'DEACTIVATED']) {
        database.agent.findUnique = async () => ({
          id: 'bad-agent',
          status: badStatus,
          serviceAreas: 'all',
          tokenVersion: 1,
          user: { name: 'Bad Agent' },
        });

        const token = signToken({
          userId: 'user-bad',
          phone: '9000000004',
          role: 'AGENT',
          agentId: 'bad-agent',
        });

        const req = new NextRequest('http://localhost/api/orders/order-any/accept', {
          method: 'POST',
          headers: { Cookie: `jio_token=${token}` },
        });

        const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-any' }) });
        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.error?.code, 'FORBIDDEN');
      }
      console.log('✓ Scenario 4 passed: Suspended/deactivated agent blocked with 403.');
    }

    // =========================================================================
    // SCENARIO 5: Out of Service Area Agent Rejected with 403 OUT_OF_SERVICE_AREA
    // =========================================================================
    console.log('Scenario 5: Out of service area agent rejected with 403...');
    {
      const orderWhitefield = makeOrder('order-wf-1', 'Whitefield');

      database.agent.findUnique = async () => ({
        id: 'jpnagar-agent',
        status: 'AVAILABLE',
        serviceAreas: 'JP Nagar, Jayanagar', // does NOT cover Whitefield
        tokenVersion: 1,
        user: { name: 'JP Nagar Agent', phone: '9000000005' },
      });

      database.order.findFirst = async () => orderWhitefield;

      const token = signToken({
        userId: 'user-jp',
        phone: '9000000005',
        role: 'AGENT',
        agentId: 'jpnagar-agent',
      });

      const req = new NextRequest('http://localhost/api/orders/order-wf-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${token}` },
      });

      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-wf-1' }) });
      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error?.code, 'OUT_OF_SERVICE_AREA');
      console.log('✓ Scenario 5 passed: Out-of-area agent rejected with OUT_OF_SERVICE_AREA.');
    }

    // =========================================================================
    // SCENARIO 6: Inactive Database Service Area Rejected with 400 SERVICE_AREA_INACTIVE
    // =========================================================================
    console.log('Scenario 6: Order in an inactive database service area rejected with 400...');
    {
      const orderKoramangala = makeOrder('order-km-1', 'JP Nagar');

      database.agent.findUnique = async () => ({
        id: 'km-agent',
        status: 'AVAILABLE',
        serviceAreas: 'all',
        tokenVersion: 1,
        user: { name: 'KM Agent', phone: '9000000006' },
      });

      database.order.findFirst = async () => orderKoramangala;

      database.serviceArea = {
        findFirst: async () => ({
          id: 'koramangala',
          name: 'Koramangala (Blocks 1 to 8)',
          status: 'INACTIVE', // Currently suspended
        }),
      };

      const token = signToken({
        userId: 'user-km',
        phone: '9000000006',
        role: 'AGENT',
        agentId: 'km-agent',
      });

      const req = new NextRequest('http://localhost/api/orders/order-km-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${token}` },
      });

      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'order-km-1' }) });
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error?.code, 'SERVICE_AREA_INACTIVE');
      console.log('✓ Scenario 6 passed: Inactive service area rejected with SERVICE_AREA_INACTIVE.');
    }
  } finally {
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findFirst = originals.orderFindFirst;
    database.$transaction = originals.transaction;
    if (database.serviceArea) {
      database.serviceArea.findFirst = originals.serviceAreaFindFirst;
    }
  }
}

void run().then(() => {
  console.log('===============================================================');
  console.log('✓ ALL PHASE 2 CONCURRENCY & ELIGIBILITY TESTS PASSED 100%!');
  console.log('===============================================================');
});
