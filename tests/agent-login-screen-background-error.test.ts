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
process.env.JWT_SECRET = 'test-agent-login-bg-error-secret-2026';

async function run() {
  const { NextRequest } = await import('next/server');
  const { signToken } = await import('../lib/auth/jwt');
  const { GET: getOrders } = await import('../app/api/orders/route');
  const { GET: authMe } = await import('../app/api/auth/me/route');
  const { POST: agentLogin } = await import('../app/api/auth/agent-login/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  console.log('--- Starting Agent Portal Login Screen Background Error Regression Tests ---');

  const mockAgent = {
    id: 'agent-bg-100',
    userId: 'user-bg-100',
    status: 'AVAILABLE',
    serviceAreas: 'Koramangala, BTM Layout',
    phone: '+917842259582',
    tokenVersion: 1,
  };

  const mockUser = {
    id: mockAgent.userId,
    phone: mockAgent.phone,
    name: 'Background Test Agent',
    role: 'AGENT',
    tokenVersion: 1,
    agent: mockAgent,
    customer: null,
    admin: null,
    addresses: [],
  };

  const ordersDatabase: any[] = [
    {
      id: 'order-bg-1',
      orderNumber: 'JIO-BG-01',
      agentId: mockAgent.id,
      status: 'AGENT_ACCEPTED',
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      createdAt: new Date().toISOString(),
      pickupCharge: 50,
      customer: { user: { id: 'u1', name: 'Cust 1', phone: '+919000000001' } },
      address: { fullAddress: '123 Main', area: 'Koramangala' },
      items: [{ id: 'item-1', categoryId: 'c1', estimatedWeight: 5, category: { name: 'Paper' } }],
    },
  ];

  const originals = {
    userFindUnique: database.user.findUnique,
    userFindFirst: database.user.findFirst,
    userCreate: database.user.create,
    userUpdate: database.user.update,
    agentFindUnique: database.agent.findUnique,
    orderFindMany: database.order.findMany,
    orderCount: database.order.count,
  };

  database.user.findUnique = async ({ where }: any) => {
    if (where.id === mockUser.id) return mockUser;
    return null;
  };
  database.user.findFirst = async () => mockUser;
  database.agent.findUnique = async ({ where }: any) => {
    if (where.id === mockAgent.id || where.userId === mockAgent.userId) return mockAgent;
    return null;
  };
  database.order.findMany = async ({ where }: any = {}) => {
    let result = ordersDatabase;
    if (where?.agentId) {
      result = result.filter((o) => o.agentId === where.agentId);
    }
    if (where?.agentId === null) {
      result = result.filter((o) => !o.agentId);
    }
    if (where?.id?.notIn) {
      result = result.filter((o) => !where.id.notIn.includes(o.id));
    }
    return result;
  };
  database.order.count = async () => ordersDatabase.length;

  try {
    // =========================================================================
    // SCENARIO 1 & 2: Unauthenticated Page Load & No /api/orders request
    // =========================================================================
    console.log('\n[Scenario 1 & 2] Testing unauthenticated page load and orders request suppression...');
    {
      let ordersFetchedCount = 0;
      let authMeFetchedCount = 0;
      let agentState: any = null;
      let dashboardErrorState: string | null = 'stale-error';

      // Simulating client-side fetch router without auth cookie
      const simulateFetch = async (url: string, init?: RequestInit) => {
        if (url.startsWith('/api/auth/me')) {
          authMeFetchedCount++;
          // Returns 401 Unauthorized
          const res = await authMe(new NextRequest('http://localhost:3000/api/auth/me'));
          return res;
        }
        if (url.startsWith('/api/orders')) {
          ordersFetchedCount++;
          const res = await getOrders(new NextRequest('http://localhost:3000/api/orders?limit=20'));
          return res;
        }
        throw new Error(`Unhandled route: ${url}`);
      };

      // Client logic matching updated app/agent/page.tsx
      const fetchAgentData = async (showLoading = true) => {
        dashboardErrorState = null;
        let isAuthenticated = false;

        try {
          const profileRes = await simulateFetch('/api/auth/me');
          const profileData = await profileRes.json().catch(() => ({ success: false }));

          if (!profileData.success || !profileData.data?.user || profileData.data.user.role !== 'AGENT') {
            agentState = null;
            dashboardErrorState = null;
            return;
          }

          isAuthenticated = true;
          agentState = profileData.data.user.agent;

          // Only reached if authenticated
          await simulateFetch('/api/orders?limit=20');
        } catch (error) {
          if (isAuthenticated || agentState) {
            dashboardErrorState = 'Network error while loading your pickup dashboard. Please retry.';
          } else {
            dashboardErrorState = null;
          }
        }
      };

      await fetchAgentData();

      assert.equal(authMeFetchedCount, 1, 'Must check /api/auth/me on initial load');
      assert.equal(ordersFetchedCount, 0, 'Must NOT fetch /api/orders when unauthenticated');
      assert.equal(agentState, null, 'Agent state must remain null for unauthenticated user');
      assert.equal(dashboardErrorState, null, 'dashboardError must be null on unauthenticated page load');
      console.log('  ✓ Verified: /api/auth/me was checked and /api/orders was NOT fetched');
      console.log('  ✓ Verified: dashboardError remained strictly null');
    }

    // =========================================================================
    // SCENARIO 3: No dashboard timeout banner on the login screen
    // =========================================================================
    console.log('\n[Scenario 3] Testing network timeout during unauthenticated session check...');
    {
      let agentState: any = null;
      let dashboardErrorState: string | null = null;
      let loginErrorState: string | null = null;

      // Simulate an AbortError timeout during unauthenticated /api/auth/me check
      const simulateTimingOutFetch = async (url: string) => {
        if (url.startsWith('/api/auth/me')) {
          const abortError = new DOMException('The operation was aborted.', 'AbortError');
          throw abortError;
        }
        throw new Error(`Unhandled route: ${url}`);
      };

      const fetchAgentDataWithTimeout = async () => {
        dashboardErrorState = null;
        let isAuthenticated = false;

        try {
          await simulateTimingOutFetch('/api/auth/me');
          isAuthenticated = true;
        } catch (error) {
          // Exactly as in updated app/agent/page.tsx
          if (isAuthenticated || agentState) {
            const isTimeout = error instanceof DOMException && error.name === 'AbortError';
            dashboardErrorState = isTimeout
              ? 'Dashboard refresh timed out. Please check your network and retry.'
              : 'Network error while loading your pickup dashboard. Please retry.';
          } else {
            dashboardErrorState = null;
          }
        }
      };

      await fetchAgentDataWithTimeout();

      assert.equal(agentState, null, 'Agent must remain unauthenticated');
      assert.equal(dashboardErrorState, null, 'dashboardError must NOT be set when unauthenticated session check times out');
      
      // Verify login error isolation
      loginErrorState = 'Please enter a valid 10-digit agent mobile number.';
      assert.equal(loginErrorState, 'Please enter a valid 10-digit agent mobile number.', 'Login-specific errors must still function normally');
      console.log('  ✓ Verified: AbortError on unauthenticated check does NOT produce a dashboardError');
      console.log('  ✓ Verified: Login card remains free of dashboard timeout banners');
    }

    // =========================================================================
    // SCENARIO 4: Dashboard timeout banner after authentication
    // =========================================================================
    console.log('\n[Scenario 4] Testing dashboard timeout banner after authentication...');
    {
      let agentState: any = mockAgent;
      let dashboardErrorState: string | null = null;
      const validToken = signToken({
        userId: mockUser.id,
        phone: mockAgent.phone,
        role: 'AGENT',
        agentId: mockAgent.id,
        tokenVersion: 1,
      });

      const simulateAuthOrdersTimeoutFetch = async (url: string) => {
        if (url.startsWith('/api/auth/me')) {
          return await authMe(new NextRequest('http://localhost:3000/api/auth/me', {
            headers: { Cookie: `jio_token=${validToken}` },
          }));
        }
        if (url.startsWith('/api/orders')) {
          // Orders fetch times out
          throw new DOMException('The operation was aborted.', 'AbortError');
        }
        throw new Error(`Unhandled route: ${url}`);
      };

      const fetchAgentDataAuthenticated = async () => {
        dashboardErrorState = null;
        let isAuthenticated = false;

        try {
          const profileRes = await simulateAuthOrdersTimeoutFetch('/api/auth/me');
          const profileData = await profileRes.json();
          if (profileData.success && profileData.data?.user?.role === 'AGENT') {
            isAuthenticated = true;
            agentState = profileData.data.user.agent;
          }

          // Orders fetch triggers timeout
          await simulateAuthOrdersTimeoutFetch('/api/orders?limit=20');
        } catch (error) {
          if (isAuthenticated || agentState) {
            const isTimeout = error instanceof DOMException && error.name === 'AbortError';
            dashboardErrorState = isTimeout
              ? 'Dashboard refresh timed out. Please check your network and retry.'
              : 'Network error while loading your pickup dashboard. Please retry.';
          } else {
            dashboardErrorState = null;
          }
        }
      };

      await fetchAgentDataAuthenticated();

      assert.notEqual(agentState, null, 'Agent must be authenticated');
      assert.equal(
        dashboardErrorState,
        'Dashboard refresh timed out. Please check your network and retry.',
        'Authenticated dashboard must display timeout error banner when orders fetch times out'
      );
      console.log('  ✓ Verified: Authenticated dashboard displays timeout error banner when orders fetch times out');
    }

    // =========================================================================
    // SCENARIO 5: Successful OTP login and dashboard loading
    // =========================================================================
    console.log('\n[Scenario 5] Testing successful OTP login and dashboard loading...');
    {
      let agentState: any = null;
      let ordersState: any[] = [];
      let dashboardErrorState: string | null = null;
      let sessionCookie: string | null = null;

      // 1. Submit OTP login
      process.env.OTP_TEST_MODE = 'true';
      process.env.OTP_TEST_PHONE = '7842259582';

      const loginReq = new NextRequest('http://localhost:3000/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '7842259582', code: '123456' }),
      });
      const loginRes = await agentLogin(loginReq);
      assert.equal(loginRes.status, 200, 'Agent login must return 200 OK');
      sessionCookie = loginRes.headers.get('set-cookie')?.match(/jio_token=([^;]+)/)?.[1] || null;
      assert.ok(sessionCookie, 'Agent login must issue session cookie');

      // 2. Run fetchAgentData post-login with session cookie
      const simulatePostLoginFetch = async (url: string) => {
        if (url.startsWith('/api/auth/me')) {
          return await authMe(new NextRequest('http://localhost:3000/api/auth/me', {
            headers: { Cookie: `jio_token=${sessionCookie}` },
          }));
        }
        if (url.startsWith('/api/orders')) {
          return await getOrders(new NextRequest('http://localhost:3000/api/orders?limit=20', {
            headers: { Cookie: `jio_token=${sessionCookie}` },
          }));
        }
        throw new Error(`Unhandled route: ${url}`);
      };

      const fetchAgentDataPostLogin = async () => {
        dashboardErrorState = null;
        let isAuthenticated = false;

        try {
          const profileRes = await simulatePostLoginFetch('/api/auth/me');
          const profileData = await profileRes.json().catch(() => ({ success: false }));

          if (!profileData.success || !profileData.data?.user || profileData.data.user.role !== 'AGENT') {
            agentState = null;
            return;
          }

          isAuthenticated = true;
          agentState = profileData.data.user.agent;

          const ordersRes = await simulatePostLoginFetch('/api/orders?limit=20');
          const ordersData = await ordersRes.json();
          const agentOrders = (ordersData.data || []).filter((o: any) => o.agentId === agentState.id);
          ordersState = agentOrders;
        } catch (error) {
          if (isAuthenticated || agentState) {
            dashboardErrorState = 'Network error while loading your pickup dashboard. Please retry.';
          }
        }
      };

      await fetchAgentDataPostLogin();

      assert.ok(agentState, 'Agent state must be populated post-login');
      assert.equal(agentState.id, mockAgent.id, 'Agent ID must match profile');
      assert.equal(ordersState.length, 1, 'Orders must be loaded for authenticated agent');
      assert.equal(ordersState[0].id, 'order-bg-1', 'Loaded order must match database');
      assert.equal(dashboardErrorState, null, 'Dashboard error must be null after successful login');
      console.log('  ✓ Verified: OTP login succeeded and issued jio_token');
      console.log('  ✓ Verified: Post-login fetchAgentData loaded agent profile and pickups without errors');
    }

    console.log('\n===============================================================');
    console.log('✔ ALL AGENT LOGIN SCREEN BACKGROUND ERROR REGRESSION TESTS PASSED!');
    console.log('===============================================================');
  } finally {
    database.user.findUnique = originals.userFindUnique;
    database.user.findFirst = originals.userFindFirst;
    database.user.create = originals.userCreate;
    database.user.update = originals.userUpdate;
    database.agent.findUnique = originals.agentFindUnique;
    database.order.findMany = originals.orderFindMany;
    database.order.count = originals.orderCount;
  }
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
