import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Hook Module._resolveFilename to provide 'server-only' stub during standalone test execution
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return require.resolve('../package.json');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
process.env.JWT_SECRET = 'test-agent-availability-scenarios-secret-2026';

async function run() {
  const { NextRequest } = await import('next/server');
  const { signToken } = await import('../lib/auth/jwt');
  const { GET: getOrders } = await import('../app/api/orders/route');
  const { GET: getOrderById } = await import('../app/api/orders/[id]/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  // Mock Agents
  const agentAvailable = {
    id: 'agent-avail-1',
    userId: 'user-agent-avail-1',
    status: 'AVAILABLE',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+919876543210',
    tokenVersion: 1,
  };

  const agentOffline = {
    id: 'agent-off-2',
    userId: 'user-agent-off-2',
    status: 'OFFLINE',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+919876543211',
    tokenVersion: 1,
  };

  const agentAssigned = {
    id: 'agent-busy-3',
    userId: 'user-agent-busy-3',
    status: 'BUSY',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+919876543212',
    tokenVersion: 1,
  };

  const agentLegacyUser = {
    id: 'agent-legacy-4',
    userId: 'user-agent-legacy-4',
    status: 'AVAILABLE',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+919876543213',
    tokenVersion: 1,
  };

  const allAgents = [agentAvailable, agentOffline, agentAssigned, agentLegacyUser];

  // Mock Users
  const allUsers = allAgents.map((a) => ({
    id: a.userId,
    phone: a.phone,
    name: `Agent ${a.id}`,
    role: 'AGENT',
    tokenVersion: 1,
    agent: a,
    customer: null,
    admin: null,
  }));

  // Mock Orders
  const openOrder1 = {
    id: 'order-open-101',
    orderNumber: 'JIO-OPEN-101',
    agentId: null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    createdAt: new Date().toISOString(),
    pickupCharge: 50,
    discountAmount: 0,
    finalAmount: 50,
    actualTotal: null,
    customer: {
      user: { id: 'cust-u1', name: 'Ravi Kumar', phone: '+919999900001' },
    },
    address: {
      name: 'Ravi Kumar',
      houseNo: '42',
      street: '1st Cross',
      area: 'Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
      lat: 12.9352,
      lng: 77.6245,
      pickupInstructions: 'Ring doorbell',
    },
    items: [
      {
        id: 'item-101',
        categoryId: 'cat-1',
        estimatedWeight: 15,
        actualWeight: null,
        ratePerKg: 10,
        category: { id: 'cat-1', name: 'Cardboard', type: 'RECYCLABLE' },
      },
    ],
  };

  const assignedOrderBusy = {
    id: 'order-assigned-201',
    orderNumber: 'JIO-ASS-201',
    agentId: 'agent-busy-3',
    status: 'AGENT_ACCEPTED',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    createdAt: new Date().toISOString(),
    pickupCharge: 60,
    discountAmount: 0,
    finalAmount: 60,
    actualTotal: null,
    customer: {
      user: { id: 'cust-u2', name: 'Priya Sharma', phone: '+919999900002' },
    },
    address: {
      name: 'Priya Sharma',
      houseNo: '88',
      street: '8th Main',
      area: 'BTM Layout',
      city: 'Bengaluru',
      pincode: '560076',
      lat: 12.9165,
      lng: 77.6101,
      pickupInstructions: 'Gate password 1234',
    },
    items: [
      {
        id: 'item-201',
        categoryId: 'cat-2',
        estimatedWeight: 20,
        actualWeight: null,
        ratePerKg: 15,
        category: { id: 'cat-2', name: 'Plastic', type: 'RECYCLABLE' },
      },
    ],
  };

  const assignedOrderLegacy = {
    id: 'order-assigned-301',
    orderNumber: 'JIO-ASS-301',
    agentId: 'agent-legacy-4',
    status: 'AGENT_ON_WAY',
    financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED',
    createdAt: new Date().toISOString(),
    pickupCharge: 70,
    discountAmount: 0,
    finalAmount: 70,
    actualTotal: null,
    customer: {
      user: { id: 'cust-u3', name: 'Anita Patel', phone: '+919999900003' },
    },
    address: {
      name: 'Anita Patel',
      houseNo: '12',
      street: '5th Block',
      area: 'Koramangala',
      city: 'Bengaluru',
      pincode: '560034',
      lat: 12.934,
      lng: 77.625,
      pickupInstructions: 'Call upon arrival',
    },
    items: [
      {
        id: 'item-301',
        categoryId: 'cat-3',
        estimatedWeight: 30,
        actualWeight: null,
        ratePerKg: 12,
        category: { id: 'cat-3', name: 'Paper', type: 'RECYCLABLE' },
      },
    ],
  };

  const allOrders = [openOrder1, assignedOrderBusy, assignedOrderLegacy];

  // Save originals
  const originals = {
    userFindUnique: database.user.findUnique,
    agentFindUnique: database.agent.findUnique,
    orderFindMany: database.order.findMany,
    orderFindUnique: database.order.findUnique,
    orderFindFirst: database.order.findFirst,
    orderCount: database.order.count,
  };

  // Mock database implementations
  database.user.findUnique = async ({ where }: any) => {
    return allUsers.find((u) => u.id === where.id || u.phone === where.phone) || null;
  };
  database.agent.findUnique = async ({ where }: any) => {
    if (where.id) {
      return allAgents.find((a) => a.id === where.id) || null;
    }
    if (where.userId) {
      return allAgents.find((a) => a.userId === where.userId) || null;
    }
    return null;
  };

  database.order.findUnique = async ({ where }: any) => {
    return allOrders.find((o) => o.id === where.id || o.orderNumber === where.orderNumber) || null;
  };

  database.order.findFirst = async ({ where }: any) => {
    return allOrders.find((o) => {
      if (where.id && o.id !== where.id) return false;
      if (where.orderNumber && o.orderNumber !== where.orderNumber) return false;
      if (where.OR && Array.isArray(where.OR)) {
        const matchesOr = where.OR.some((cond: any) => {
          if (cond.id && o.id === cond.id) return true;
          if (cond.orderNumber && o.orderNumber === cond.orderNumber) return true;
          return false;
        });
        if (!matchesOr) return false;
      }
      if (where.agentId && o.agentId !== where.agentId) return false;
      if (where.status && where.status.in && !where.status.in.includes(o.status)) return false;
      return true;
    }) || null;
  };

  database.order.findMany = async ({ where, orderBy, take, skip }: any) => {
    return allOrders.filter((o) => {
      if (where.agentId === null && o.agentId !== null) return false;
      if (typeof where.agentId === 'string' && o.agentId !== where.agentId) return false;
      if (where.status?.in && !where.status.in.includes(o.status)) return false;
      if (where.id?.notIn && where.id.notIn.includes(o.id)) return false;
      return true;
    });
  };

  database.order.count = async () => allOrders.length;

  console.log('--- Starting Agent Portal Availability Scenarios Verification ---');

  try {
    // Tokens
    const tokenAvailable = signToken({ userId: agentAvailable.userId, phone: agentAvailable.phone, role: 'AGENT', agentId: agentAvailable.id });
    const tokenOffline = signToken({ userId: agentOffline.userId, phone: agentOffline.phone, role: 'AGENT', agentId: agentOffline.id });
    const tokenAssigned = signToken({ userId: agentAssigned.userId, phone: agentAssigned.phone, role: 'AGENT', agentId: agentAssigned.id });
    // Legacy token with ONLY userId (NO agentId in JWT payload)
    const tokenLegacyWithoutAgentId = signToken({ userId: agentLegacyUser.userId, phone: agentLegacyUser.phone, role: 'AGENT' });

    // =========================================================================
    // Scenario 1: AVAILABLE Agent
    // - Can see open pickups in list (GET /api/orders)
    // - Can view open pickup details (GET /api/orders/[id])
    // =========================================================================
    console.log('\n[Scenario 1] Testing AVAILABLE Agent...');
    {
      // 1A. List orders
      const listReq = new NextRequest('http://localhost:3000/api/orders', {
        headers: { Cookie: `jio_token=${tokenAvailable}` },
      });
      const listRes = await getOrders(listReq);
      assert.equal(listRes.status, 200, 'AVAILABLE agent should receive 200 from GET /api/orders');
      const listData = await listRes.json();
      assert.ok(listData.data, 'Response should contain data');
      const openPickups = listData.data.filter((o: any) => o.agentId === null);
      assert.ok(openPickups.length > 0, 'AVAILABLE agent should see open unassigned pickups');
      console.log('  ✓ AVAILABLE agent successfully lists open unassigned pickups');

      // 1B. View open pickup details
      const detailReq = new NextRequest(`http://localhost:3000/api/orders/${openOrder1.id}`, {
        headers: { Cookie: `jio_token=${tokenAvailable}` },
      });
      const detailRes = await getOrderById(detailReq, { params: Promise.resolve({ id: openOrder1.id }) });
      assert.equal(detailRes.status, 200, 'AVAILABLE agent should receive 200 when viewing open pickup details');
      const detailData = await detailRes.json();
      assert.ok(detailData.data, 'Detail response should contain order data');
      assert.equal(detailData.data.id, openOrder1.id, 'Should return matching order ID');
      // Redacted info for unassigned open pickup preview: only area and items, customer is omitted entirely
      assert.equal(detailData.data.address.area, 'Koramangala', 'Area should be visible');
      assert.equal(detailData.data.customer, undefined, 'Customer info must be omitted for open pickup preview');
      assert.equal(detailData.data.items.length, 1, 'Items should be visible');
      console.log('  ✓ AVAILABLE agent successfully views open pickup details (with privacy protection: area & items only)');
    }

    // =========================================================================
    // Scenario 2: OFFLINE Agent
    // - Cannot see open pickups in list (GET /api/orders)
    // - Cannot view open pickup details (GET /api/orders/[id]) -> 403 Forbidden
    // =========================================================================
    console.log('\n[Scenario 2] Testing OFFLINE Agent...');
    {
      // 2A. List orders
      const listReq = new NextRequest('http://localhost:3000/api/orders', {
        headers: { Cookie: `jio_token=${tokenOffline}` },
      });
      const listRes = await getOrders(listReq);
      assert.equal(listRes.status, 200, 'OFFLINE agent should receive 200 from GET /api/orders');
      const listData = await listRes.json();
      const openPickups = listData.data.filter((o: any) => o.agentId === null);
      assert.equal(openPickups.length, 0, 'OFFLINE agent MUST NOT see unassigned open pickups');
      console.log('  ✓ OFFLINE agent does NOT receive unassigned open pickups in list');

      // 2B. View open pickup details -> 403 Forbidden
      const detailReq = new NextRequest(`http://localhost:3000/api/orders/${openOrder1.id}`, {
        headers: { Cookie: `jio_token=${tokenOffline}` },
      });
      const detailRes = await getOrderById(detailReq, { params: Promise.resolve({ id: openOrder1.id }) });
      assert.equal(detailRes.status, 403, 'OFFLINE agent MUST receive 403 when attempting to view open pickup');
      const detailData = await detailRes.json();
      assert.equal(
        detailData.error.message,
        'Only available agents may view open pickup details.',
        'OFFLINE agent should receive clear availability error message'
      );
      console.log('  ✓ OFFLINE agent is blocked with 403: "Only available agents may view open pickup details."');
    }

    // =========================================================================
    // Scenario 3: ASSIGNED Agent (has an active order)
    // - Cannot see open pickups in list
    // - Cannot view open pickup details -> 403 Forbidden
    // =========================================================================
    console.log('\n[Scenario 3] Testing ASSIGNED Agent...');
    {
      // 3A. List orders
      const listReq = new NextRequest('http://localhost:3000/api/orders', {
        headers: { Cookie: `jio_token=${tokenAssigned}` },
      });
      const listRes = await getOrders(listReq);
      assert.equal(listRes.status, 200, 'ASSIGNED agent should receive 200 from GET /api/orders');
      const listData = await listRes.json();
      const openPickups = listData.data.filter((o: any) => o.agentId === null);
      assert.equal(openPickups.length, 0, 'ASSIGNED agent MUST NOT see unassigned open pickups');
      const myAssigned = listData.data.filter((o: any) => o.agentId === agentAssigned.id);
      assert.equal(myAssigned.length, 1, 'ASSIGNED agent should see their assigned active order');
      console.log('  ✓ ASSIGNED agent receives only their active order, NOT open pickups');

      // 3B. Attempt to view open pickup details -> 403 Forbidden
      const detailReq = new NextRequest(`http://localhost:3000/api/orders/${openOrder1.id}`, {
        headers: { Cookie: `jio_token=${tokenAssigned}` },
      });
      const detailRes = await getOrderById(detailReq, { params: Promise.resolve({ id: openOrder1.id }) });
      assert.equal(detailRes.status, 403, 'ASSIGNED agent MUST receive 403 when attempting to view open pickup');
      const detailData = await detailRes.json();
      assert.equal(
        detailData.error.message,
        'Only available agents may view open pickup details.',
        'ASSIGNED agent should receive clear availability message'
      );
      console.log('  ✓ ASSIGNED agent blocked with 403 from viewing open pickup details');
    }

    // =========================================================================
    // Scenario 4: Agent without agentId in JWT (Legacy Token)
    // - Fallback lookup using userId resolves the agent record
    // - Can view open pickups if AVAILABLE
    // - Can view their assigned order
    // =========================================================================
    console.log('\n[Scenario 4] Testing Agent without agentId in JWT (Fallback via userId)...');
    {
      // 4A. List orders with legacy token (has userId, but NO agentId in payload)
      const listReq = new NextRequest('http://localhost:3000/api/orders', {
        headers: { Cookie: `jio_token=${tokenLegacyWithoutAgentId}` },
      });
      const listRes = await getOrders(listReq);
      assert.equal(listRes.status, 200, 'Legacy agent should receive 200 from GET /api/orders');
      const listData = await listRes.json();
      assert.ok(listData.data, 'Should return data array');
      const myAssigned = listData.data.filter((o: any) => o.agentId === agentLegacyUser.id);
      assert.equal(myAssigned.length, 1, 'Legacy agent should successfully locate their assigned orders via userId fallback');
      const openPickups = listData.data.filter((o: any) => o.agentId === null);
      assert.ok(openPickups.length > 0, 'Legacy agent with AVAILABLE status should see open pickups');
      console.log('  ✓ Legacy token without agentId resolves userId fallback and lists both assigned and open orders');

      // 4B. View open pickup details with legacy token
      const openDetailReq = new NextRequest(`http://localhost:3000/api/orders/${openOrder1.id}`, {
        headers: { Cookie: `jio_token=${tokenLegacyWithoutAgentId}` },
      });
      // Temporarily mark agent as having no active order to test preview
      const savedAssignedAgentId = assignedOrderLegacy.agentId;
      assignedOrderLegacy.agentId = 'other-agent';
      try {
        const openDetailRes = await getOrderById(openDetailReq, { params: Promise.resolve({ id: openOrder1.id }) });
        assert.equal(openDetailRes.status, 200, 'Legacy agent without agentId in JWT can preview open pickup when available');
        console.log('  ✓ Legacy agent without agentId in JWT previews open pickup via userId lookup');
      } finally {
        assignedOrderLegacy.agentId = savedAssignedAgentId;
      }

      // 4C. View assigned order details with legacy token
      const assignedDetailReq = new NextRequest(`http://localhost:3000/api/orders/${assignedOrderLegacy.id}`, {
        headers: { Cookie: `jio_token=${tokenLegacyWithoutAgentId}` },
      });
      const assignedDetailRes = await getOrderById(assignedDetailReq, { params: Promise.resolve({ id: assignedOrderLegacy.id }) });
      if (assignedDetailRes.status !== 200) {
        console.error('Scenario 4C unexpected status:', assignedDetailRes.status, await assignedDetailRes.json());
      }
      assert.equal(assignedDetailRes.status, 200, 'Legacy agent can view their own assigned order details via userId fallback');
      const assignedDetailData = await assignedDetailRes.json();
      assert.equal(assignedDetailData.data.customer.user.name, 'Anita Patel', 'Assigned agent should receive full customer name');
      assert.equal(assignedDetailData.data.customer.user.phone, '+919999900003', 'Assigned agent should receive full customer phone');
      console.log('  ✓ Legacy agent without agentId in JWT views their assigned order details via userId lookup');
    }

    // =========================================================================
    // Scenario 5: Existing Assigned Orders Workflow
    // - Assigned agent views full order details
    // - Unauthorized agent cannot view another agent\'s assigned order
    // =========================================================================
    console.log('\n[Scenario 5] Testing Existing Assigned Orders Workflow...');
    {
      // 5A. Assigned agent views their own order details
      const assignedReq = new NextRequest(`http://localhost:3000/api/orders/${assignedOrderBusy.id}`, {
        headers: { Cookie: `jio_token=${tokenAssigned}` },
      });
      const assignedRes = await getOrderById(assignedReq, { params: Promise.resolve({ id: assignedOrderBusy.id }) });
      assert.equal(assignedRes.status, 200, 'Assigned agent should receive 200');
      const assignedData = await assignedRes.json();
      assert.equal(assignedData.data.id, assignedOrderBusy.id);
      assert.equal(assignedData.data.customer.user.name, 'Priya Sharma');
      assert.equal(assignedData.data.customer.user.phone, '+919999900002');
      assert.equal(assignedData.data.address.pickupInstructions, 'Gate password 1234');
      console.log('  ✓ Assigned agent views full customer details and instructions for their assigned order');

      // 5B. Another agent (e.g. agentAvailable) attempts to view assignedOrderBusy -> 403 Forbidden
      const unauthReq = new NextRequest(`http://localhost:3000/api/orders/${assignedOrderBusy.id}`, {
        headers: { Cookie: `jio_token=${tokenAvailable}` },
      });
      const unauthRes = await getOrderById(unauthReq, { params: Promise.resolve({ id: assignedOrderBusy.id }) });
      assert.equal(unauthRes.status, 403, 'Unauthorized agent must receive 403 when attempting to view another agent\'s assigned order');
      const unauthData = await unauthRes.json();
      assert.equal(unauthData.error.message, 'Order is not assigned to your agent profile.');
      console.log('  ✓ Unauthorized agent correctly denied access (403: "Order is not assigned to your agent profile.")');
    }

    console.log('\n===============================================================');
    console.log('✔ ALL 5 AGENT PORTAL AVAILABILITY SCENARIOS PASSED 100%!');
    console.log('===============================================================');
  } finally {
    // Restore originals
    database.user.findUnique = originals.userFindUnique;
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findMany = originals.orderFindMany;
    database.order.findUnique = originals.orderFindUnique;
    database.order.findFirst = originals.orderFindFirst;
    database.order.count = originals.orderCount;
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
