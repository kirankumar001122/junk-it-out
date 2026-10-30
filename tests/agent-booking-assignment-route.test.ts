import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { POST as assignOrder } from '../app/api/orders/[id]/assign/route';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { db } from '../lib/db';
import { broadcaster } from '../lib/realtime';
import { signToken } from '../lib/auth/jwt';
import { getAgentBookingNotificationId } from '../lib/services/agentBookingNotification';

process.env.JWT_SECRET = 'agent-booking-assignment-test-secret-32-bytes';

async function run() {
  const orderDelegate = db.order as any;
  const agentDelegate = db.agent as any;
  const originalOrderFindUnique = orderDelegate.findUnique;
  const originalOrderFindFirst = orderDelegate.findFirst;
  const originalAgentFindUnique = agentDelegate.findUnique;
  const originalTransaction = (db as any).$transaction;
  const originalConsoleError = console.error;
  const notifications = new Map<string, any>();
  const smsNotifications = new Map<string, any>();
  const events: unknown[] = [];
  const unsubscribe = broadcaster.subscribe((event) => {
    if (event.event === 'AGENT_BOOKING_ASSIGNED') events.push(event.payload);
  });
  const agent = {
    id: 'agent-1',
    userId: 'agent-user-1',
    status: 'AVAILABLE',
    serviceAreas: 'all',
    vehicleNumber: 'TEST-1',
    user: { id: 'agent-user-1', name: 'Test Agent', phone: '0000000000' },
  };
  const agent2 = {
    ...agent,
    id: 'agent-2',
    userId: 'agent-user-2',
    vehicleNumber: 'TEST-2',
    user: { id: 'agent-user-2', name: 'Test Agent 2', phone: '0000000002' },
  };
  const agents = new Map([[agent.id, agent], [agent2.id, agent2]]);
  let order: any = {
    id: 'order-assigned',
    orderNumber: 'JIO-ASSIGNED-1',
    agentId: null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    customer: { userId: 'customer-user-1', user: { phone: '0000000001' } },
    agent: null,
    address: {},
    items: [],
  };
  let failAssignment = false;

  orderDelegate.findUnique = async () => order;
  orderDelegate.findFirst = async () => order;
  agentDelegate.findUnique = async ({ where }: any) => agents.get(where.id) || agent;
  (db as any).$transaction = async (callback: (tx: any) => Promise<unknown>) => callback({
    $queryRaw: async () => [],
    order: {
      findFirst: async () => null,
      updateMany: async ({ where, data }: any) => {
        assert.equal(where.id, order.id);
        if (Array.isArray(where.OR)) {
          const matches = where.OR.some((condition: any) =>
            condition.agentId === order.agentId && condition.status.in.includes(order.status));
          if (!matches || (where.paymentStatus && where.paymentStatus !== order.paymentStatus)) {
            return { count: 0 };
          }
        } else {
          if (where.agentId !== order.agentId || where.status !== order.status) return { count: 0 };
        }
        if (failAssignment) throw new Error('simulated assignment transaction failure');
        order = { ...order, agentId: data.agentId, status: data.status, agent: agents.get(data.agentId) || agent };
        return { count: 1 };
      },
      findUnique: async () => order,
    },
    orderStatusHistory: { create: async () => ({ id: 'history-1' }) },
    notification: {
      create: async () => ({ id: 'customer-notification-1' }),
      createMany: async ({ data }: any) => {
        const notification = data[0];
        if (notification.id.startsWith('agent-assignment-sms-')) {
          if (smsNotifications.has(notification.id)) return { count: 0 };
          smsNotifications.set(notification.id, notification);
          return { count: 1 };
        }
        const agentForNotification = [...agents.values()].find((candidate) =>
          notification.id === getAgentBookingNotificationId(order.id, candidate.id));
        assert.ok(agentForNotification);
        assert.equal(notification.userId, agentForNotification.userId);
        if (notifications.has(notification.id)) return { count: 0 };
        notifications.set(notification.id, notification);
        return { count: 1 };
      },
    },
    agent: {
      findUnique: async ({ where }: any) => agents.get(where.id) || agent,
      update: async ({ where }: any) => agents.get(where.id) || agent,
    },
    auditLog: { create: async () => ({ id: 'audit-1' }) },
  });

  const adminToken = signToken({ userId: 'admin-1', phone: '0000000002', role: 'ADMIN' });
  const agentToken = signToken({ userId: agent.userId, phone: agent.user.phone, role: 'AGENT', agentId: agent.id });
  const agent2Token = signToken({ userId: agent2.userId, phone: agent2.user.phone, role: 'AGENT', agentId: agent2.id });
  const request = (orderId: string) => new NextRequest(`http://localhost/api/orders/${orderId}/assign`, {
    method: 'POST',
    headers: { Cookie: `jio_token=${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id }),
  });

  try {
    console.error = () => {};
    const first = await assignOrder(request(order.id), { params: Promise.resolve({ id: order.id }) });
    assert.equal(first.status, 200);
    assert.equal(order.status, 'AGENT_ASSIGNED');
    assert.equal(notifications.size, 1);
    assert.equal(events.length, 1);

    // A retry returns the existing assignment without creating or sending another notification.
    const retry = await assignOrder(request(order.id), { params: Promise.resolve({ id: order.id }) });
    assert.equal(retry.status, 200);
    assert.equal(notifications.size, 1);
    assert.equal(events.length, 1);

    order = {
      ...order,
      id: 'order-assignment-failure',
      orderNumber: 'JIO-FAILED-1',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      agent: null,
    };
    failAssignment = true;
    const failed = await assignOrder(request(order.id), { params: Promise.resolve({ id: order.id }) });
    assert.equal(failed.status, 500);
    assert.equal(notifications.size, 1);
    assert.equal(events.length, 1);

    order = {
      ...order,
      id: 'order-agent-accept',
      orderNumber: 'JIO-AGENT-ACCEPT-1',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      address: { area: 'Area' },
      agent: null,
    };
    failAssignment = false;
    const acceptRequest = (token = agentToken, orderId = order.id) => new NextRequest(`http://localhost/api/orders/${orderId}/accept`, {
      method: 'POST',
      headers: { Cookie: `jio_token=${token}` },
    });
    const accepted = await acceptOrder(acceptRequest(), { params: Promise.resolve({ id: order.id }) });
    assert.equal(accepted.status, 200);
    assert.equal(order.status, 'AGENT_ACCEPTED');
    assert.equal(events.length, 2);

    // Agent retries are idempotent and do not create a second booking message.
    const acceptRetry = await acceptOrder(acceptRequest(), { params: Promise.resolve({ id: order.id }) });
    assert.equal(acceptRetry.status, 200);
    assert.equal(events.length, 2);

    order = {
      ...order,
      id: 'order-agent-accept-failure',
      orderNumber: 'JIO-AGENT-FAILED-1',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      agent: null,
    };
    failAssignment = true;
    const failedAccept = await acceptOrder(acceptRequest(), { params: Promise.resolve({ id: order.id }) });
    assert.equal(failedAccept.status, 500);
    assert.equal(events.length, 2);

    order = {
      ...order,
      id: 'order-concurrent-agent-accept',
      orderNumber: 'JIO-CONCURRENT-1',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      paymentStatus: 'CAPTURED',
      agent: null,
    };
    failAssignment = false;
    const concurrentAccepts = await Promise.all([
      acceptOrder(acceptRequest(agentToken, order.id), { params: Promise.resolve({ id: order.id }) }),
      acceptOrder(acceptRequest(agent2Token, order.id), { params: Promise.resolve({ id: order.id }) }),
    ]);
    assert.deepEqual(concurrentAccepts.map((response) => response.status).sort(), [200, 409]);
    assert.equal(order.status, 'AGENT_ACCEPTED');
    assert.ok(order.agentId === agent.id || order.agentId === agent2.id);
    assert.equal(notifications.size, 3);
    assert.equal(events.length, 3);

    order = {
      ...order,
      id: 'order-unpaid-agent-accept',
      orderNumber: 'JIO-UNPAID-1',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      paymentStatus: 'PENDING',
      agent: null,
    };
    const unpaidAccept = await acceptOrder(acceptRequest(agentToken, order.id), { params: Promise.resolve({ id: order.id }) });
    assert.equal(unpaidAccept.status, 409);
    assert.equal(order.agentId, null);
  } finally {
    console.error = originalConsoleError;
    unsubscribe();
    orderDelegate.findUnique = originalOrderFindUnique;
    orderDelegate.findFirst = originalOrderFindFirst;
    agentDelegate.findUnique = originalAgentFindUnique;
    (db as any).$transaction = originalTransaction;
    await db.$disconnect();
  }
}

void run().then(() => {
  console.log('Agent booking assignment route notification tests passed.');
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
