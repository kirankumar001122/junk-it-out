import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getOrderDetailRoute } from '../app/api/orders/[id]/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

process.env.JWT_SECRET = 'local-test-secret-at-least-32-bytes-long-for-jwt-security';

async function run() {
  const orderDelegate = db.order as any;
  const originalFindFirst = orderDelegate.findFirst;
  const userDelegate = db.user as any;
  const originalUserFindUnique = userDelegate?.findUnique;
  (db as any).user = {
    ...userDelegate,
    findUnique: async () => ({ tokenVersion: 1 }),
  };

  let capturedQueryArgs: any = null;
  const testOrderId = 'c3a41b49-5d70-439d-86b4-a67330fc819a';
  const testOrderNumber = 'JIO-20261102-0001';
  const customerId = 'cust-101';
  const userId = 'user-101';

  const mockOrder = {
    id: testOrderId,
    orderNumber: testOrderNumber,
    customerId,
    customer: {
      id: customerId,
      userId,
      user: { id: userId, name: 'Test User', phone: '+919999911111', email: 'test@example.com' },
    },
    agentId: null,
    agent: null,
    address: {
      houseNo: '10',
      street: '1st Main',
      area: 'JP Nagar',
      pincode: '560078',
      lat: 12.91,
      lng: 77.59,
    },
    items: [],
    statusHistory: [],
    payments: [],
    invoices: [],
    weightRecords: [],
    settlement: {
      totalWeightKg: 15.5,
      amount: 310.0,
      status: 'READY_FOR_PAYOUT',
    },
  };

  orderDelegate.findFirst = async (args: any) => {
    capturedQueryArgs = args;
    return mockOrder;
  };

  const customerToken = signToken({
    userId,
    customerId,
    phone: '+919999911111',
    role: 'CUSTOMER',
    tokenVersion: 1,
  });

  try {
    // 1. Unauthenticated request must return 401 UNAUTHORIZED
    const unauthReq = new NextRequest(`http://localhost/api/orders/${testOrderId}`);
    const unauthRes = await getOrderDetailRoute(unauthReq, {
      params: Promise.resolve({ id: testOrderId }),
    });
    assert.equal(unauthRes.status, 401, 'Unauthenticated access must be rejected with 401');

    // 2. Ownership check: another customer must receive 403 FORBIDDEN
    const otherCustomerToken = signToken({
      userId: 'other-user',
      customerId: 'other-cust',
      phone: '+919999922222',
      role: 'CUSTOMER',
    tokenVersion: 1,
    });
    const forbiddenReq = new NextRequest(`http://localhost/api/orders/${testOrderId}`, {
      headers: { Cookie: `jio_token=${otherCustomerToken}` },
    });
    const forbiddenRes = await getOrderDetailRoute(forbiddenReq, {
      params: Promise.resolve({ id: testOrderId }),
    });
    assert.equal(forbiddenRes.status, 403, 'Unauthorized customer access must be rejected with 403');

    // 3. Authenticated owner request must return 200 OK
    const ownerReq = new NextRequest(`http://localhost/api/orders/${testOrderId}`, {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const ownerRes = await getOrderDetailRoute(ownerReq, {
      params: Promise.resolve({ id: testOrderId }),
    });
    assert.equal(ownerRes.status, 200, 'Authenticated owner request must return 200');

    // 4. Verify explicit settlement select projection
    assert.ok(capturedQueryArgs?.include?.settlement?.select, 'Query must use explicit select projection for settlement');
    assert.deepEqual(
      capturedQueryArgs.include.settlement.select,
      { totalWeightKg: true, amount: true, status: true },
      'Settlement query must strictly request only totalWeightKg, amount, and status',
    );

    // 5. Verify unmigrated columns are NOT requested
    const unmigratedColumns = ['payoutId', 'utr', 'payoutMethod', 'failureReason', 'processedAt'];
    for (const column of unmigratedColumns) {
      assert.equal(
        capturedQueryArgs.include.settlement.select[column],
        undefined,
        `Settlement query must not request unmigrated column: ${column}`,
      );
    }

    // 6. Verify response data contains the selected settlement fields
    const responseBody = await ownerRes.json();
    assert.equal(responseBody.success, true);
    assert.deepEqual(responseBody.data.settlement, {
      totalWeightKg: 15.5,
      amount: 310.0,
      status: 'READY_FOR_PAYOUT',
    });

    console.log('✓ Order detail settlement projection regression tests passed cleanly.');
  } finally {
    orderDelegate.findFirst = originalFindFirst;
    if (userDelegate && originalUserFindUnique) {
      userDelegate.findUnique = originalUserFindUnique;
    }
  }
}

void run().catch((err) => {
  console.error('Order detail settlement projection test failed:', err);
  process.exit(1);
});

