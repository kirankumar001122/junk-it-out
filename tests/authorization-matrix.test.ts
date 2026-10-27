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

process.env.JWT_SECRET = 'auth-matrix-test-secret';

async function run() {
  const { NextRequest } = await import('next/server');
  const { GET: getOrder } = await import('../app/api/orders/[id]/route');
  const { POST: acceptOrder } = await import('../app/api/orders/[id]/accept/route');
  const { POST: assignOrder } = await import('../app/api/orders/[id]/assign/route');
  const { POST: startOrder } = await import('../app/api/orders/[id]/start/route');
  const { POST: arriveOrder } = await import('../app/api/orders/[id]/arrive/route');
  const { POST: completeOrder } = await import('../app/api/orders/[id]/complete/route');
  const { POST: statusOrder } = await import('../app/api/orders/[id]/status/route');
  const { db } = await import('../lib/db');
  const { signToken } = await import('../lib/auth/jwt');

  function createToken(role: 'ADMIN' | 'AGENT' | 'CUSTOMER' | 'SUPER_ADMIN', extra: Record<string, unknown> = {}) {
    return signToken({
      userId: `${role.toLowerCase()}-user`,
      phone: '9999999999',
      name: `${role} User`,
      role,
      ...extra,
    });
  }

  function req(url: string, token?: string, body?: unknown, method = 'POST') {
    return new NextRequest(`http://localhost${url}`, {
      method,
      headers: {
        ...(token ? { Cookie: `jio_token=${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  const original = {
    orderFindFirst: (db.order as any).findFirst,
    orderFindUnique: (db.order as any).findUnique,
    agentFindUnique: (db.agent as any).findUnique,
    auditLogCreate: (db.auditLog as any).create,
    transaction: (db as any).$transaction,
  };

  const customer1Token = createToken('CUSTOMER', { userId: 'user-c1', customerId: 'cust-1' });
  const customer2Token = createToken('CUSTOMER', { userId: 'user-c2', customerId: 'cust-2' });
  const agent1Token = createToken('AGENT', { userId: 'user-a1', agentId: 'agent-1' });
  const agent2Token = createToken('AGENT', { userId: 'user-a2', agentId: 'agent-2' });
  const adminToken = createToken('ADMIN', { userId: 'user-admin' });

  let mockOrder: any = {
    id: 'test-order-1',
    orderNumber: 'JIO-AUTH-1',
    customerId: 'cust-1',
    customer: { userId: 'user-c1', user: { phone: '9876543210', name: 'Cust' } },
    agentId: 'agent-1',
    agent: { userId: 'user-a1', user: { name: 'Agent 1' }, vehicleNumber: 'KA-01-1234' },
    status: 'AGENT_ACCEPTED',
    paymentStatus: 'CAPTURED',
    financialDirection: 'CUSTOMER_PAYS',
    finalAmount: 100,
    address: { area: 'JP Nagar' },
    items: [],
    invoices: [],
    weightRecords: [{ id: 'w1' }],
  };

  (db.order as any).findFirst = async () => ({ ...mockOrder });
  (db.order as any).findUnique = async () => ({ ...mockOrder });
  (db.agent as any).findUnique = async ({ where }: any) => {
    if (where.id === 'agent-1') {
      return { id: 'agent-1', status: 'AVAILABLE', serviceAreas: 'JP Nagar, Koramangala', user: { name: 'Agent 1' } };
    }
    if (where.id === 'agent-2') {
      return { id: 'agent-2', status: 'AVAILABLE', serviceAreas: 'Whitefield', user: { name: 'Agent 2' } };
    }
    return null;
  };
  (db.auditLog as any).create = async () => ({ id: 'audit-1' });
  (db.notification as any).create = async () => ({ id: 'notif-1' });
  (db as any).$transaction = async (cb: any) => {
    const tx = {
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ ...mockOrder }),
      },
      orderStatusHistory: { create: async () => ({ id: 'h1' }) },
      notification: { create: async () => ({ id: 'n1' }) },
      agent: { update: async () => ({}) },
      invoice: { create: async () => ({ id: 'inv-1' }) },
      auditLog: { create: async () => ({}) },
    };
    return cb(tx);
  };

  const params = { params: Promise.resolve({ id: 'test-order-1' }) };

  try {
    console.log('Testing Authorization Matrix...');

    // 1. View Order Matrix
    const viewAnon = await getOrder(req('/api/orders/test-order-1', undefined, undefined, 'GET'), params);
    assert.equal(viewAnon.status, 401, 'Unauthenticated view denied (401)');

    const viewOwnCustomer = await getOrder(req('/api/orders/test-order-1', customer1Token, undefined, 'GET'), params);
    assert.equal(viewOwnCustomer.status, 200, 'Customer viewing own order allowed (200)');

    const viewOtherCustomer = await getOrder(req('/api/orders/test-order-1', customer2Token, undefined, 'GET'), params);
    assert.equal(viewOtherCustomer.status, 403, 'Customer viewing another customer order denied (403)');

    const viewAssignedAgent = await getOrder(req('/api/orders/test-order-1', agent1Token, undefined, 'GET'), params);
    assert.equal(viewAssignedAgent.status, 200, 'Assigned agent viewing order allowed (200)');

    const viewOtherAgent = await getOrder(req('/api/orders/test-order-1', agent2Token, undefined, 'GET'), params);
    assert.equal(viewOtherAgent.status, 403, 'Unassigned agent viewing another agent order denied (403)');

    const viewAdmin = await getOrder(req('/api/orders/test-order-1', adminToken, undefined, 'GET'), params);
    assert.equal(viewAdmin.status, 200, 'Admin viewing any order allowed (200)');
    console.log('PASS: View Order Authorization Matrix verified.');

    // 2. Accept Order Matrix
    mockOrder.status = 'BOOKING_RECEIVED';
    mockOrder.agentId = null;
    const acceptCust = await acceptOrder(req('/api/orders/test-order-1/accept', customer1Token), params);
    assert.equal(acceptCust.status, 403, 'Customer accepting order denied (403)');

    const acceptAdmin = await acceptOrder(req('/api/orders/test-order-1/accept', adminToken), params);
    assert.equal(acceptAdmin.status, 403, 'Admin accepting order denied (403)');
    console.log('PASS: Accept Order Authorization Matrix verified.');

    // 3. Manual Assign Matrix
    mockOrder.status = 'BOOKING_RECEIVED';
    mockOrder.agentId = null;
    const assignCust = await assignOrder(req('/api/orders/test-order-1/assign', customer1Token, { agentId: 'agent-1' }), params);
    assert.equal(assignCust.status, 403, 'Customer manual assign denied (403)');

    const assignAgent = await assignOrder(req('/api/orders/test-order-1/assign', agent1Token, { agentId: 'agent-1' }), params);
    assert.equal(assignAgent.status, 403, 'Agent manual assign denied (403)');

    const assignAdmin = await assignOrder(req('/api/orders/test-order-1/assign', adminToken, { agentId: 'agent-1' }), params);
    assert.equal(assignAdmin.status, 200, 'Admin manual assign allowed (200)');
    console.log('PASS: Manual Assign Authorization Matrix verified.');

    // 4. Start / Arrive / Complete Matrix
    mockOrder.status = 'AGENT_ACCEPTED';
    mockOrder.agentId = 'agent-1';

    const startCust = await startOrder(req('/api/orders/test-order-1/start', customer1Token), params);
    assert.equal(startCust.status, 401, 'Customer starting journey denied (401)');

    const startAdmin = await startOrder(req('/api/orders/test-order-1/start', adminToken), params);
    assert.equal(startAdmin.status, 401, 'Admin starting journey denied (401)');

    const startOtherAgent = await startOrder(req('/api/orders/test-order-1/start', agent2Token), params);
    assert.equal(startOtherAgent.status, 403, 'Other agent starting journey denied (403)');

    mockOrder.status = 'AGENT_ON_WAY';
    const arriveCust = await arriveOrder(req('/api/orders/test-order-1/arrive', customer1Token), params);
    assert.equal(arriveCust.status, 401, 'Customer arrival denied (401)');

    const arriveAdmin = await arriveOrder(req('/api/orders/test-order-1/arrive', adminToken), params);
    assert.equal(arriveAdmin.status, 401, 'Admin arrival denied (401)');

    mockOrder.status = 'WEIGHING';
    const completeCust = await completeOrder(req('/api/orders/test-order-1/complete', customer1Token), params);
    assert.equal(completeCust.status, 401, 'Customer completion denied (401)');

    const completeAdmin = await completeOrder(req('/api/orders/test-order-1/complete', adminToken), params);
    assert.equal(completeAdmin.status, 401, 'Admin completion denied (401)');
    console.log('PASS: Start/Arrive/Complete Doorstep Operations Matrix verified.');

    // 5. Status Override Matrix
    mockOrder.status = 'BOOKING_RECEIVED';
    const statusCust = await statusOrder(req('/api/orders/test-order-1/status', customer1Token, { newStatus: 'AGENT_ASSIGNED' }), params);
    assert.equal(statusCust.status, 403, 'Customer status override denied (403)');

    const statusAgent = await statusOrder(req('/api/orders/test-order-1/status', agent1Token, { newStatus: 'AGENT_ASSIGNED' }), params);
    assert.equal(statusAgent.status, 403, 'Agent status override denied (403)');

    const statusAdmin = await statusOrder(req('/api/orders/test-order-1/status', adminToken, { newStatus: 'AGENT_ASSIGNED' }), params);
    assert.equal(statusAdmin.status, 200, 'Admin status override allowed (200)');
    console.log('PASS: Status Override Authorization Matrix verified.');

    console.log('ALL AUTHORIZATION MATRIX TESTS PASSED SUCCESSFULLY.');
  } finally {
    (db.order as any).findFirst = original.orderFindFirst;
    (db.order as any).findUnique = original.orderFindUnique;
    (db.agent as any).findUnique = original.agentFindUnique;
    (db.auditLog as any).create = original.auditLogCreate;
    (db as any).$transaction = original.transaction;
  }
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
