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
process.env.JWT_SECRET = 'test-agent-refresh-action-secret-2026';

async function run() {
  const { NextRequest } = await import('next/server');
  const { signToken } = await import('../lib/auth/jwt');
  const { GET: getOrders } = await import('../app/api/orders/route');
  const { GET: authMe } = await import('../app/api/auth/me/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  console.log('--- Starting Agent Portal Refresh Action Verification ---');

  const mockAgent = {
    id: 'agent-refresh-100',
    userId: 'user-refresh-100',
    status: 'AVAILABLE',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+919988776655',
    tokenVersion: 1,
  };

  const mockUser = {
    id: mockAgent.userId,
    phone: mockAgent.phone,
    name: 'Refresh Test Agent',
    role: 'AGENT',
    tokenVersion: 1,
    agent: mockAgent,
    customer: null,
    admin: null,
    addresses: [],
  };

  let ordersDatabase: any[] = [
    {
      id: 'order-assigned-1',
      orderNumber: 'JIO-ASS-01',
      agentId: mockAgent.id,
      status: 'AGENT_ACCEPTED',
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      createdAt: new Date().toISOString(),
      pickupCharge: 50,
      customer: { user: { id: 'u1', name: 'Cust 1', phone: '+919000000001' } },
      address: { area: 'Koramangala' },
      items: [{ id: 'it1', categoryId: 'c1', estimatedWeight: 10, category: { name: 'Paper' } }],
    },
    {
      id: 'order-open-initial',
      orderNumber: 'JIO-OPEN-01',
      agentId: null,
      status: 'BOOKING_RECEIVED',
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      createdAt: new Date().toISOString(),
      pickupCharge: 40,
      customer: { user: { id: 'u2', name: 'Cust 2', phone: '+919000000002' } },
      address: { area: 'Koramangala' },
      items: [{ id: 'it2', categoryId: 'c2', estimatedWeight: 15, category: { name: 'Cardboard' } }],
    },
  ];

  const originals = {
    userFindUnique: database.user.findUnique,
    agentFindUnique: database.agent.findUnique,
    orderFindMany: database.order.findMany,
    orderCount: database.order.count,
  };

  database.user.findUnique = async ({ where }: any) => {
    if (where.id === mockUser.id) return mockUser;
    return null;
  };

  database.agent.findUnique = async ({ where }: any) => {
    if (where.id === mockAgent.id || where.userId === mockAgent.userId) return mockAgent;
    return null;
  };

  database.order.findMany = async ({ where }: any) => {
    return ordersDatabase.filter((o) => {
      if (where.agentId === null && o.agentId !== null) return false;
      if (typeof where.agentId === 'string' && o.agentId !== where.agentId) return false;
      if (where.status?.in && !where.status.in.includes(o.status)) return false;
      if (where.id?.notIn && where.id.notIn.includes(o.id)) return false;
      return true;
    });
  };

  database.order.count = async ({ where }: any) => {
    return ordersDatabase.filter((o) => {
      if (where.agentId && o.agentId !== where.agentId) return false;
      return true;
    }).length;
  };

  try {
    const token = signToken({
      userId: mockAgent.userId,
      phone: mockAgent.phone,
      role: 'AGENT',
      agentId: mockAgent.id,
    });

    // =========================================================================
    // Test 1: Verify Refresh Endpoints Return Correct Structure & Latest Data
    // =========================================================================
    console.log('\n[Test 1] Testing /api/auth/me and /api/orders refresh payloads...');
    {
      const authRes = await authMe(new NextRequest('http://localhost:3000/api/auth/me', {
        headers: { Cookie: `jio_token=${token}` },
      }));
      assert.equal(authRes.status, 200, '/api/auth/me should return 200');
      const authData = await authRes.json();
      assert.equal(authData.data.user.role, 'AGENT');
      assert.equal(authData.data.user.agent.id, mockAgent.id);
      console.log('  ✓ /api/auth/me delivers current agent profile');

      const ordersRes = await getOrders(new NextRequest('http://localhost:3000/api/orders?limit=20', {
        headers: { Cookie: `jio_token=${token}` },
      }));
      assert.equal(ordersRes.status, 200, '/api/orders should return 200');
      const ordersData = await ordersRes.json();
      assert.ok(Array.isArray(ordersData.data), 'orders data must be an array');
      assert.equal(ordersData.data.length, 2, 'should return initial active order + initial open order');
      console.log('  ✓ /api/orders?limit=20 delivers initial pickup assignments');
    }

    // =========================================================================
    // Test 2: Verify Refresh Reflects Order State Changes & Count Updates
    // =========================================================================
    console.log('\n[Test 2] Testing refresh after active order completes and new open pickup appears...');
    {
      // Simulate: Order 1 completed, new open order 2 arrives
      ordersDatabase[0].status = 'PICKUP_COMPLETED';
      ordersDatabase.push({
        id: 'order-open-new',
        orderNumber: 'JIO-OPEN-02',
        agentId: null,
        status: 'BOOKING_RECEIVED',
        financialDirection: 'CUSTOMER_PAYS',
        paymentStatus: 'CAPTURED',
        createdAt: new Date().toISOString(),
        pickupCharge: 45,
        customer: { user: { id: 'u3', name: 'Cust 3', phone: '+919000000003' } },
        address: { area: 'BTM Layout' },
        items: [{ id: 'it3', categoryId: 'c3', estimatedWeight: 25, category: { name: 'Metal' } }],
      });

      const refreshRes = await getOrders(new NextRequest('http://localhost:3000/api/orders?limit=20', {
        headers: { Cookie: `jio_token=${token}` },
      }));
      assert.equal(refreshRes.status, 200);
      const refreshData = await refreshRes.json();

      // Check agent orders
      const agentOrders = refreshData.data.filter((o: any) => o.agentId === mockAgent.id);
      assert.equal(agentOrders.length, 1);
      assert.equal(agentOrders[0].status, 'PICKUP_COMPLETED', 'Active order status should now be completed');

      // Check active assignments (should be 0 since order completed)
      const activeAssignments = agentOrders.filter(
        (o: any) => !['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'CANCELLED'].includes(o.status)
      );
      assert.equal(activeAssignments.length, 0, 'Agent should now have 0 active assignments');

      // Check unassigned open orders (should have 2 open orders)
      const unassignedOpen = refreshData.data.filter(
        (o: any) => !o.agentId && ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'].includes(o.status)
      );
      assert.equal(unassignedOpen.length, 2, 'Should now see 2 open unassigned pickups');
      console.log('  ✓ Refresh correctly delivers updated completion counts and new available pickups');
    }

    // =========================================================================
    // Test 3: Frontend Refresh Logic Simulation (Immediate Spinner, Notice Updates, Error Safety)
    // =========================================================================
    console.log('\n[Test 3] Testing frontend refresh handler contract & state transitions...');
    {
      let isRefreshingState = false;
      let loadingState = false;
      let dashboardErrorState: string | null = null;
      let statusNoticeState: string | null = null;
      let newPickupNoticeState: any = { orderId: 'old-stale-order', orderNumber: 'OLD-999' };
      let ordersState: any[] = [];
      let dataRequestRef = false;
      let refreshAfterRequestRef = false;

      // Simulated fetchAgentData matching app/agent/page.tsx
      const fetchAgentData = async (showLoading = true, isManual = false) => {
        if (dataRequestRef) {
          refreshAfterRequestRef = true;
          if (!showLoading) {
            isRefreshingState = true;
          }
          return;
        }
        dataRequestRef = true;
        dashboardErrorState = null;
        if (showLoading) loadingState = true;
        else isRefreshingState = true;

        try {
          // Fetch orders
          const res = await getOrders(new NextRequest('http://localhost:3000/api/orders?limit=20', {
            headers: { Cookie: `jio_token=${token}` },
          }));
          const data = await res.json();
          const agentOrders = data.data.filter((o: any) => o.agentId === mockAgent.id);
          ordersState = agentOrders;

          const activeAssignments = agentOrders.filter(
            (o: any) => !['PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED', 'CANCELLED'].includes(o.status)
          );
          const assigned = activeAssignments[0] || null;

          const unassignedOpen = data.data.filter(
            (o: any) => !o.agentId && ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'].includes(o.status)
          );
          const isAgentAvailable = mockAgent.status === 'AVAILABLE';

          // Critical fix: fresh overwrite instead of (current) => current || { ... }
          if (unassignedOpen.length > 0 && !assigned && isAgentAvailable) {
            const topUnassigned = unassignedOpen[0];
            newPickupNoticeState = {
              type: 'NEW_PICKUP_AVAILABLE',
              orderId: topUnassigned.id,
              orderNumber: topUnassigned.orderNumber,
            };
          } else {
            newPickupNoticeState = null;
          }

          if (isManual) {
            statusNoticeState = 'Pickup assignments refreshed.';
          }
        } catch (err: any) {
          dashboardErrorState = 'Network error while loading your pickup dashboard. Please retry.';
        } finally {
          dataRequestRef = false;
          if (refreshAfterRequestRef) {
            refreshAfterRequestRef = false;
            await fetchAgentData(false);
          } else {
            loadingState = false;
            isRefreshingState = false;
          }
        }
      };

      const handleRefresh = async () => {
        isRefreshingState = true;
        await fetchAgentData(false, true);
      };

      // 3A: Trigger manual refresh
      assert.equal(isRefreshingState, false);
      const refreshPromise = handleRefresh();
      // Should IMMEDIATELY enter refreshing state
      assert.equal(isRefreshingState, true, 'Clicking refresh must immediately activate isRefreshing');
      await refreshPromise;
      // Should complete and clear refreshing state
      assert.equal(isRefreshingState, false, 'Refresh must deactivate isRefreshing on completion');
      assert.equal(statusNoticeState, 'Pickup assignments refreshed.', 'Should set user-facing notice');
      assert.notEqual(newPickupNoticeState?.orderId, 'old-stale-order', 'Old stale pickup notice must be replaced');
      assert.equal(newPickupNoticeState?.orderId, 'order-open-initial', 'Should show latest open pickup');
      console.log('  ✓ Immediate isRefreshing indicator verified; stale notice successfully updated');

      // 3B: Test clear notice when open pickups disappear
      ordersDatabase = ordersDatabase.filter((o) => o.agentId !== null); // Remove all open orders
      await handleRefresh();
      assert.equal(newPickupNoticeState, null, 'Pickup notice must be cleared to null when no open pickups exist');
      console.log('  ✓ Pickup notice cleanly cleared when no open pickups are available');

      // 3C: Test error state handling
      const savedFindMany = database.order.findMany;
      database.order.findMany = async () => {
        throw new Error('Database connection failed');
      };
      try {
        await handleRefresh();
        assert.equal(isRefreshingState, false, 'Loading must stop on error');
        assert.ok(dashboardErrorState, 'Error message must be presented clearly on failure');
      } finally {
        database.order.findMany = savedFindMany;
      }
      console.log('  ✓ Error handling verified: loading stops and dashboardError is set');
    }

    console.log('\n===============================================================');
    console.log('✔ AGENT REFRESH ACTION REGRESSION SUITE PASSED 100%!');
    console.log('===============================================================');
  } finally {
    database.user.findUnique = originals.userFindUnique;
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findMany = originals.orderFindMany;
    database.order.count = originals.orderCount;
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
