import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getOrder } from '../app/api/orders/[id]/route';
import { GET as listOrders } from '../app/api/orders/route';
import { POST as acceptOrder } from '../app/api/orders/[id]/accept/route';
import { POST as startOrder } from '../app/api/orders/[id]/start/route';
import { POST as arriveOrder } from '../app/api/orders/[id]/arrive/route';
import { POST as weighOrder } from '../app/api/orders/[id]/weigh/route';
import { POST as completeOrder } from '../app/api/orders/[id]/complete/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'agent-order-access-test-secret-key-2026';

const database = db as any;
const agentId = 'agent-access-test';
let order: any;
let activeOrder: { id: string } | null = null;
let locationQueries = 0;
let mockOrdersList: any[] = [];

const originals = {
  agentFindUnique: database.agent.findUnique,
  orderFindFirst: database.order.findFirst,
  agentLocationFindMany: database.agentLocation.findMany,
  orderFindMany: database.order.findMany,
};

database.agent.findUnique = async ({ where, select }: any) => {
  if (where.id !== agentId) return null;
  if (select?.tokenVersion) return { tokenVersion: 1 };
  return { id: agentId, status: 'AVAILABLE', serviceAreas: 'Koramangala' };
};
database.order.findFirst = async ({ where }: any) => {
  if (where.agentId) return activeOrder;
  return order;
};
database.agentLocation.findMany = async () => {
  locationQueries += 1;
  return [];
};
database.order.findMany = async (args: any) => {
  const where = args?.where || {};
  let filtered = mockOrdersList.filter((item) => {
    if (where.agentId && item.agentId !== where.agentId) return false;
    if (where.customerId && item.customerId !== where.customerId) return false;
    if (where.OR && Array.isArray(where.OR)) {
      const matchesOr = where.OR.some((cond: any) => {
        if (cond.financialDirection) {
          if (cond.financialDirection.not && item.financialDirection === cond.financialDirection.not) return false;
          if (typeof cond.financialDirection === 'string' && item.financialDirection !== cond.financialDirection) return false;
          if (cond.paymentStatus?.in && !cond.paymentStatus.in.includes(item.paymentStatus)) return false;
          if (cond.paymentStatus && typeof cond.paymentStatus === 'string' && item.paymentStatus !== cond.paymentStatus) return false;
          return true;
        }
        if (cond.customerId && item.customerId === cond.customerId) return true;
        return false;
      });
      if (!matchesOr) return false;
    }
    if (where.status?.in && !where.status.in.includes(item.status)) return false;
    if (where.id?.notIn && where.id.notIn.includes(item.id)) return false;
    return true;
  });

  if (args?.orderBy?.createdAt === 'desc') {
    filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  if (typeof args?.take === 'number') {
    filtered = filtered.slice(0, args.take);
  }

  return filtered;
};

const agentToken = signToken({
  userId: 'agent-access-user',
  phone: '9000000000',
  role: 'AGENT',
  agentId,
});
const customerToken = signToken({
  userId: 'customer-access-user',
  phone: '9000000001',
  role: 'CUSTOMER',
  customerId: 'customer-access-id',
});

function request(path: string, token: string, method = 'GET') {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: { Cookie: `jio_token=${token}` },
  });
}

function orderFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'open-order',
    orderNumber: 'JIO-OPEN-1',
    customerId: 'private-customer-id',
    agentId: null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'JUNKITOUT_PAYS',
    paymentStatus: 'PENDING',
    customer: { user: { name: 'Private Customer', phone: '9000000002' } },
    address: {
      name: 'Private Customer',
      houseNo: '42',
      street: 'Private Street',
      area: 'Koramangala',
      lat: 12.9,
      lng: 77.5,
      pickupInstructions: 'Private instruction',
    },
    items: [{
      id: 'open-item',
      categoryId: 'category-1',
      estimatedWeight: 5,
      actualWeight: 4,
      category: { id: 'category-1', name: 'Paper' },
    }],
    ...overrides,
  };
}

async function run() {
  try {
    // -------------------------------------------------------------------------
    // 1. Existing Route Privacy & Authorization Tests
    // -------------------------------------------------------------------------
    order = orderFixture({ agentId: 'another-agent', status: 'AGENT_ACCEPTED' });
    locationQueries = 0;
    const crossAgent = await getOrder(request('/api/orders/other-agent-order', agentToken), {
      params: Promise.resolve({ id: 'other-agent-order' }),
    });
    assert.equal(crossAgent.status, 403);
    assert.doesNotMatch(await crossAgent.text(), /Private Customer|Private Street|private-customer-id/);
    assert.equal(locationQueries, 0);

    order = orderFixture({ address: { ...orderFixture().address, area: 'Indiranagar' } });
    const outsideArea = await getOrder(request('/api/orders/outside-area', agentToken), {
      params: Promise.resolve({ id: 'outside-area' }),
    });
    assert.equal(outsideArea.status, 403);
    assert.doesNotMatch(await outsideArea.text(), /Private Customer|Private Street|9000000002/);

    order = orderFixture({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: 'PENDING' });
    const unpaidOrder = await getOrder(request('/api/orders/unpaid', agentToken), {
      params: Promise.resolve({ id: 'unpaid' }),
    });
    assert.equal(unpaidOrder.status, 403);
    assert.doesNotMatch(await unpaidOrder.text(), /Private Customer|Private Street/);

    order = orderFixture();
    activeOrder = { id: 'different-active-order' };
    const busyAgent = await getOrder(request('/api/orders/busy-agent', agentToken), {
      params: Promise.resolve({ id: 'busy-agent' }),
    });
    assert.equal(busyAgent.status, 403);
    activeOrder = null;

    const eligibleOrder = await getOrder(request('/api/orders/open', agentToken), {
      params: Promise.resolve({ id: 'open' }),
    });
    assert.equal(eligibleOrder.status, 200);
    const eligibleBody = await eligibleOrder.json() as any;
    assert.equal(eligibleBody.data.address.area, 'Koramangala');
    assert.equal(eligibleBody.data.address.street, undefined);
    assert.equal(eligibleBody.data.address.lat, undefined);
    assert.equal(eligibleBody.data.address.pickupInstructions, undefined);
    assert.equal(eligibleBody.data.customer, undefined);
    assert.equal(eligibleBody.data.customerId, undefined);
    assert.equal(eligibleBody.data.items[0].actualWeight, undefined);

    const actionCases = [
      { path: '/api/orders/customer-action/accept', handler: acceptOrder, expected: 403 },
      { path: '/api/orders/customer-action/start', handler: startOrder, expected: 401 },
      { path: '/api/orders/customer-action/arrive', handler: arriveOrder, expected: 401 },
      { path: '/api/orders/customer-action/weigh', handler: weighOrder, expected: 401 },
      { path: '/api/orders/customer-action/complete', handler: completeOrder, expected: 401 },
    ];
    for (const action of actionCases) {
      const response = await action.handler(request(action.path, customerToken, 'POST'), {
        params: Promise.resolve({ id: 'customer-action' }),
      } as any);
      assert.equal(response.status, action.expected, `customer must not call ${action.path}`);
    }

    // -------------------------------------------------------------------------
    // 2. Active-Order Retrieval & Pagination Invariance Tests
    // -------------------------------------------------------------------------

    // Scenario A: 1 active order + 25 newer completed orders with requested limit 20
    // Active order must be at index 0 and must not be truncated by limit.
    const olderActiveOrder = orderFixture({
      id: 'active-pickup-1',
      orderNumber: 'JIO-ACT-1',
      agentId,
      status: 'AGENT_ACCEPTED',
      financialDirection: 'JUNKITOUT_PAYS',
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-01-01T10:00:00.000Z'),
    });

    const newerCompletedOrders = Array.from({ length: 25 }, (_, i) =>
      orderFixture({
        id: `completed-${i + 1}`,
        orderNumber: `JIO-CMP-${i + 1}`,
        agentId,
        status: 'PICKUP_COMPLETED',
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'CAPTURED',
        createdAt: new Date(`2026-02-01T${String(i).padStart(2, '0')}:00:00.000Z`),
      })
    );

    mockOrdersList = [olderActiveOrder, ...newerCompletedOrders];

    const listRes = await listOrders(request('/api/orders?limit=20', agentToken));
    assert.equal(listRes.status, 200);
    const listBody = (await listRes.json()) as any;
    assert.equal(listBody.success, true);
    assert.equal(listBody.data.length, 20, 'Response should contain exactly the requested limit of 20 orders');
    assert.equal(listBody.data[0].id, 'active-pickup-1', 'Active order must appear first even when older than 25 completed orders');

    // Verify historical orders are not duplicated
    const returnedIds = listBody.data.map((o: any) => o.id);
    const uniqueIds = new Set(returnedIds);
    assert.equal(uniqueIds.size, returnedIds.length, 'No duplicate orders allowed in the response');

    // Scenario B: Multiple active assignments with limit=1
    // Must return all active orders (exceeding limit) and log a structured anomaly.
    const secondActiveOrder = orderFixture({
      id: 'active-pickup-2',
      orderNumber: 'JIO-ACT-2',
      agentId,
      status: 'AGENT_ON_WAY',
      financialDirection: 'JUNKITOUT_PAYS',
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-01-02T10:00:00.000Z'),
    });

    mockOrdersList = [olderActiveOrder, secondActiveOrder, ...newerCompletedOrders];

    const loggedErrors: string[] = [];
    const originalConsoleError = console.error;
    console.error = (msg: unknown) => {
      if (typeof msg === 'string') loggedErrors.push(msg);
      else loggedErrors.push(JSON.stringify(msg));
    };

    try {
      const multiActiveRes = await listOrders(request('/api/orders?limit=1', agentToken));
      assert.equal(multiActiveRes.status, 200);
      const multiActiveBody = (await multiActiveRes.json()) as any;
      assert.equal(multiActiveBody.success, true);
      assert.equal(
        multiActiveBody.data.length,
        2,
        'When multiple active assignments exist, all must be returned without truncation even if exceeding limit'
      );
      assert.equal(multiActiveBody.data[0].id, 'active-pickup-2');
      assert.equal(multiActiveBody.data[1].id, 'active-pickup-1');

      const anomalyLogged = loggedErrors.some((log) =>
        log.includes('agent.data_integrity.multiple_active_orders')
      );
      assert.equal(anomalyLogged, true, 'Multiple active orders must trigger structured anomaly logging');
    } finally {
      console.error = originalConsoleError;
    }

    // Scenario C: Agent scoping and payment eligibility enforcement
    const otherAgentOrder = orderFixture({
      id: 'other-agent-order',
      agentId: 'other-agent-id',
      status: 'AGENT_ACCEPTED',
      financialDirection: 'JUNKITOUT_PAYS',
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
    });
    const unpaidCustomerPaysActive = orderFixture({
      id: 'unpaid-customer-pays',
      agentId,
      status: 'AGENT_ASSIGNED',
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'PENDING',
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
    });
    const paidCustomerPaysActive = orderFixture({
      id: 'paid-customer-pays',
      agentId,
      status: 'AGENT_ASSIGNED',
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
    });

    mockOrdersList = [
      olderActiveOrder,
      otherAgentOrder,
      unpaidCustomerPaysActive,
      paidCustomerPaysActive,
    ];

    const scopedRes = await listOrders(request('/api/orders?limit=20', agentToken));
    assert.equal(scopedRes.status, 200);
    const scopedBody = (await scopedRes.json()) as any;
    const scopedIds = scopedBody.data.map((o: any) => o.id);
    assert.ok(!scopedIds.includes('other-agent-order'), 'Orders for other agents must be excluded');
    assert.ok(!scopedIds.includes('unpaid-customer-pays'), 'Unpaid CUSTOMER_PAYS orders must be excluded');
    assert.ok(scopedIds.includes('paid-customer-pays'), 'Paid CUSTOMER_PAYS orders must be included');
    assert.ok(scopedIds.includes('active-pickup-1'), 'Legitimate agent active order must be included');

    // Scenario D: Non-agent order listing retains existing behavior
    const customerOrder = orderFixture({
      id: 'cust-order-1',
      customerId: 'customer-access-id',
      status: 'BOOKING_RECEIVED',
      financialDirection: 'JUNKITOUT_PAYS',
      createdAt: new Date('2026-02-10T00:00:00.000Z'),
    });
    mockOrdersList = [customerOrder];

    const customerRes = await listOrders(request('/api/orders?limit=10', customerToken));
    assert.equal(customerRes.status, 200);
    const customerBody = (await customerRes.json()) as any;
    assert.equal(customerBody.data.length, 1);
    assert.equal(customerBody.data[0].id, 'cust-order-1');
  } finally {
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findFirst = originals.orderFindFirst;
    database.agentLocation.findMany = originals.agentLocationFindMany;
    database.order.findMany = originals.orderFindMany;
  }
}

void run().then(() => console.log('Agent order privacy and action authorization scenarios passed.'));
