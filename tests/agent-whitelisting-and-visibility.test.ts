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
process.env.JWT_SECRET = 'test-agent-whitelist-secret-2026';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_PHONE = '7479895482';

async function run() {
  const { NextRequest } = await import('next/server');
  const { POST: agentLogin } = await import('../app/api/auth/agent-login/route');
  const { POST: adminLogin } = await import('../app/api/auth/admin-login/route');
  const { GET: listOrders } = await import('../app/api/orders/route');
  const { GET: authMe } = await import('../app/api/auth/me/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  const testPhoneNumber = '+917479895482';
  const rawDigits = '7479895482';

  let mockUser: any = {
    id: 'dual-role-user-id',
    phone: testPhoneNumber,
    name: 'Sumit Admin Agent',
    email: `admin_${rawDigits}@junkitout.in`,
    role: 'SUPER_ADMIN',
    admin: { id: 'admin-7479895482', userId: 'dual-role-user-id', department: 'Operations', accessLevel: 'SUPER_ADMIN' },
    agent: { id: 'agent-7479895482', userId: 'dual-role-user-id', status: 'AVAILABLE', serviceAreas: 'Koramangala, HSR Layout' },
    customer: null,
  };

  let orderUpdateManyCalled = false;

  const originals = {
    userFindFirst: database.user.findFirst,
    userFindUnique: database.user.findUnique,
    userCreate: database.user.create,
    userUpdate: database.user.update,
    agentFindUnique: database.agent.findUnique,
    adminFindUnique: database.admin.findUnique,
    adminUpsert: database.admin.upsert,
    orderFindMany: database.order.findMany,
    orderUpdateMany: database.order.updateMany,
  };

  database.user.findFirst = async () => mockUser;
  database.user.findUnique = async () => mockUser;
  database.user.update = async ({ data }: any) => {
    mockUser = { ...mockUser, ...data };
    return mockUser;
  };
  database.agent.findUnique = async ({ where }: any) => {
    if (where.id === 'agent-7479895482') return mockUser.agent;
    return null;
  };
  database.admin.findUnique = async () => mockUser.admin;
  database.admin.upsert = async () => mockUser.admin;
  database.order.updateMany = async () => {
    orderUpdateManyCalled = true;
    return { count: 0 };
  };

  try {
    // -------------------------------------------------------------------------
    // 1. Verify Agent Login for +917479895482
    // -------------------------------------------------------------------------
    orderUpdateManyCalled = false;
    const agentReq = new NextRequest('http://localhost/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhoneNumber, code: '123456' }),
    });

    const agentRes = await agentLogin(agentReq);
    assert.equal(agentRes.status, 200, '+917479895482 should successfully authenticate as agent');
    assert.equal(orderUpdateManyCalled, false, 'Agent login must NOT reassign unassigned orders');

    const agentCookie = agentRes.headers.get('set-cookie')?.match(/jio_token=([^;]+)/)?.[1];
    assert.ok(agentCookie, 'Agent login should issue jio_token');

    // Verify GET /api/auth/me returns role AGENT for agent token
    const agentMeRes = await authMe(new NextRequest('http://localhost/api/auth/me', {
      headers: { Cookie: `jio_token=${agentCookie}` },
    }));
    assert.equal(agentMeRes.status, 200);
    const agentMeBody = await agentMeRes.json();
    assert.equal(agentMeBody.data.user.role, 'AGENT', 'Agent session should reflect AGENT role in /api/auth/me');
    assert.ok(agentMeBody.data.user.agent, 'Agent profile must be included');

    // -------------------------------------------------------------------------
    // 2. Verify Admin Login for +917479895482
    // -------------------------------------------------------------------------
    const adminReq = new NextRequest('http://localhost/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: testPhoneNumber, code: '123456' }),
    });

    const adminRes = await adminLogin(adminReq);
    assert.equal(adminRes.status, 200, '+917479895482 should successfully authenticate as admin');

    const adminCookie = adminRes.headers.get('set-cookie')?.match(/jio_token=([^;]+)/)?.[1];
    assert.ok(adminCookie, 'Admin login should issue jio_token');

    // Verify GET /api/auth/me returns role SUPER_ADMIN for admin token
    const adminMeRes = await authMe(new NextRequest('http://localhost/api/auth/me', {
      headers: { Cookie: `jio_token=${adminCookie}` },
    }));
    assert.equal(adminMeRes.status, 200);
    const adminMeBody = await adminMeRes.json();
    assert.equal(adminMeBody.data.user.role, 'SUPER_ADMIN', 'Admin session should reflect SUPER_ADMIN role in /api/auth/me');
    assert.ok(adminMeBody.data.user.admin, 'Admin profile must be included');

    // -------------------------------------------------------------------------
    // 3. Verify GET /api/orders returns available unassigned orders in agent area
    // -------------------------------------------------------------------------
    const ordersMockData = [
      {
        id: 'assigned-order-1',
        orderNumber: 'JIO-ASS-1',
        agentId: 'agent-7479895482',
        status: 'AGENT_ASSIGNED',
        financialDirection: 'CUSTOMER_PAYS',
        paymentStatus: 'CAPTURED',
        address: { area: 'Koramangala' },
        items: [],
      },
      {
        id: 'unassigned-koramangala',
        orderNumber: 'JIO-UNASS-1',
        agentId: null,
        status: 'BOOKING_RECEIVED',
        financialDirection: 'CUSTOMER_PAYS',
        paymentStatus: 'CAPTURED',
        address: { area: 'Koramangala' },
        items: [{ id: 'item-1', estimatedWeight: 10, category: { name: 'Cardboard' } }],
      },
      {
        id: 'unassigned-different-area',
        orderNumber: 'JIO-UNASS-2',
        agentId: null,
        status: 'BOOKING_RECEIVED',
        financialDirection: 'CUSTOMER_PAYS',
        paymentStatus: 'CAPTURED',
        address: { area: 'Whitefield' },
        items: [],
      },
    ];

    database.order.findMany = async (args: any) => {
      const where = args?.where || {};
      return ordersMockData.filter((item) => {
        if (where.agentId !== undefined && item.agentId !== where.agentId) return false;
        if (where.status?.in && !where.status.in.includes(item.status)) return false;
        return true;
      });
    };

    const ordersRes = await listOrders(new NextRequest('http://localhost/api/orders', {
      headers: { Cookie: `jio_token=${agentCookie}` },
    }));
    assert.equal(ordersRes.status, 200);
    const ordersBody = await ordersRes.json();
    assert.equal(ordersBody.success, true);

    const returnedOrderIds = ordersBody.data.map((o: any) => o.id);
    assert.ok(returnedOrderIds.includes('assigned-order-1'), 'Assigned order must be present');
    assert.ok(returnedOrderIds.includes('unassigned-koramangala'), 'Unassigned order in Koramangala must be visible to agent');
    assert.ok(!returnedOrderIds.includes('unassigned-different-area'), 'Unassigned order outside agent service area must not be visible');

    console.log('✓ All Agent Whitelisting, Multi-Role Login, and Order Visibility tests passed successfully!');
  } finally {
    database.user.findFirst = originals.userFindFirst;
    database.user.findUnique = originals.userFindUnique;
    database.user.create = originals.userCreate;
    database.user.update = originals.userUpdate;
    database.agent.findUnique = originals.agentFindUnique;
    database.admin.findUnique = originals.adminFindUnique;
    database.admin.upsert = originals.adminUpsert;
    database.order.findMany = originals.orderFindMany;
    database.order.updateMany = originals.orderUpdateMany;
  }
}

void run();
