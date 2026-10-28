import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'agent-accept-concurrency-test-secret';

const database = db as any;
const agentId = 'single-active-agent';
const agentUser = { id: 'single-active-user', name: 'Synthetic Agent', phone: '9000000000' };
let agentStatus = 'AVAILABLE';
const orders = new Map<string, any>([
  ['order-a', makeOrder('order-a')],
  ['order-b', makeOrder('order-b')],
]);
let lockTail = Promise.resolve();
const originals = {
  agentFindUnique: database.agent.findUnique,
  orderFindFirst: database.order.findFirst,
  transaction: database.$transaction,
};

function makeOrder(id: string) {
  return {
    id,
    orderNumber: `JIO-${id}`,
    agentId: null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'JUNKITOUT_PAYS',
    paymentStatus: 'PENDING',
    address: { area: 'Koramangala' },
    customer: { userId: 'synthetic-customer', user: { name: 'Synthetic Customer', phone: '9000000001' } },
    items: [],
  };
}

database.agent.findUnique = async ({ where }: any) => where.id === agentId
  ? { id: agentId, userId: agentUser.id, status: agentStatus, serviceAreas: 'Koramangala', tokenVersion: 1, user: agentUser }
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
      findFirst: async ({ where }: any) => [...orders.values()].find((candidate) =>
        candidate.agentId === where.agentId && where.status.in.includes(candidate.status),
      ) || null,
      updateMany: async ({ where, data }: any) => {
        const candidate = orders.get(where.id);
        const stateMatches = where.OR.some((condition: any) =>
          candidate?.agentId === condition.agentId && condition.status.in.includes(candidate.status),
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

function request(orderId: string) {
  return new NextRequest(`http://localhost/api/orders/${orderId}/accept`, {
    method: 'POST',
    headers: { Cookie: `jio_token=${token}` },
  });
}

async function run() {
  try {
    const responses = await Promise.all(['order-a', 'order-b'].map((orderId) =>
      acceptOrder(request(orderId), { params: Promise.resolve({ id: orderId }) }),
    ));
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
    assert.equal([...orders.values()].filter((candidate) =>
      candidate.agentId === agentId && candidate.status === 'AGENT_ACCEPTED',
    ).length, 1, 'one agent must not acquire two active orders concurrently');
  } finally {
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findFirst = originals.orderFindFirst;
    database.$transaction = originals.transaction;
  }
}

void run().then(() => console.log('Concurrent agent assignment exclusivity scenario passed.'));
