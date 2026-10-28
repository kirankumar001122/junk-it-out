import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import {
  ACTIVE_CUSTOMER_CATEGORIES,
  isCustomerPickupCategory,
  readPickupCart,
  addToPickupCart,
  clearPickupCart,
} from '../lib/pickupCart';
import {
  getCachedClientJson,
  invalidateCachedClientJson,
} from '../lib/clientRequestCache';
import {
  GET as customerAddressesGet,
  POST as customerAddressesPost,
  DELETE as customerAddressesDelete,
} from '../app/api/customer/addresses/route';
import {
  createOrder,
  createOrderPayloadHash,
  OrderIdempotencyConflictError,
} from '../lib/services/orderService';
import { GET as customerStreamRoute } from '../app/api/customer/stream/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'local-test-secret-at-least-32-bytes-long-for-jwt-security';

function createCustomerToken(userId: string, phone: string, customerId = `cust-${userId}`) {
  return signToken({
    userId,
    phone,
    role: 'CUSTOMER',
    customerId,
  });
}

async function testStages5Through9() {
  console.log('--- Testing Stage 5: Category Authority & Eligibility ---');
  assert.equal(ACTIVE_CUSTOMER_CATEGORIES.length, 4);
  assert.deepEqual([...ACTIVE_CUSTOMER_CATEGORIES].sort(), [
    'E-Waste',
    'Household Dry Waste',
    'Paper & Cardboard',
    'Plastic Waste',
  ]);

  assert.equal(isCustomerPickupCategory('Paper & Cardboard'), true);
  assert.equal(isCustomerPickupCategory('Plastic Waste'), true);
  assert.equal(isCustomerPickupCategory('E-Waste'), true);
  assert.equal(isCustomerPickupCategory('Household Dry Waste'), true);

  assert.equal(isCustomerPickupCategory('Scrap Metal'), false, 'Scrap metal requires custom bulk pickup');
  assert.equal(isCustomerPickupCategory('Appliances (Fridge/AC/Washing Machine)'), false);
  assert.equal(isCustomerPickupCategory('Glass & Bottles'), false);
  assert.equal(isCustomerPickupCategory('Old Furniture & Heavy Scrap'), false);
  assert.equal(isCustomerPickupCategory(null), false);
  console.log('✓ Stage 5 assertions passed.');

  console.log('--- Testing Stage 6: Client Request Cache Invalidation ---');
  let fetchCounter = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    fetchCounter += 1;
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, count: fetchCounter }),
    } as any;
  }) as any;

  try {
    const res1 = await getCachedClientJson<any>('test-user-auth', 'http://localhost/api/test', 5000);
    assert.equal(res1.count, 1);

    // Cached call within TTL returns cached value
    const res2 = await getCachedClientJson<any>('test-user-auth', 'http://localhost/api/test', 5000);
    assert.equal(res2.count, 1, 'Should return cached response within TTL');
    assert.equal(fetchCounter, 1);

    // Invalidate and force call immediately re-fetches
    invalidateCachedClientJson('test-user-auth');
    const res3 = await getCachedClientJson<any>('test-user-auth', 'http://localhost/api/test', 5000, { force: true });
    assert.equal(res3.count, 2, 'Should immediately re-fetch after invalidation');
    assert.equal(fetchCounter, 2);
    console.log('✓ Stage 6 cache invalidation assertions passed.');
  } finally {
    globalThis.fetch = originalFetch;
  }

  console.log('--- Testing Stage 7: Saved Addresses Authentication Gate ---');
  const addressDelegate = (db as any).address;
  const userDelegate = (db as any).user;
  const origAddressFindMany = addressDelegate.findMany;
  const origAddressCreate = addressDelegate.create;
  const origAddressDeleteMany = addressDelegate.deleteMany;
  const origUserFindUnique = userDelegate.findUnique;

  const mockAddresses = [
    { id: 'addr-c1', userId: 'cust-u1', label: 'Home', houseNo: '10', street: '1st Cross', area: 'JP Nagar' },
    { id: 'addr-c2', userId: 'cust-u2', label: 'Office', houseNo: '20', street: '2nd Cross', area: 'Jayanagar' },
  ];
  const queriedUserIds: string[] = [];
  const createdAddresses: any[] = [];
  const deletedAddressQueries: any[] = [];

  addressDelegate.findMany = async ({ where }: any) => {
    queriedUserIds.push(where.userId);
    return mockAddresses.filter((a) => a.userId === where.userId);
  };
  userDelegate.findUnique = async ({ where }: any) => {
    if (where.id === 'cust-u1') return { id: 'cust-u1', phone: '9999911111', name: 'Alice' };
    if (where.id === 'cust-u2') return { id: 'cust-u2', phone: '9999922222', name: 'Bob' };
    return null;
  };
  addressDelegate.create = async ({ data }: any) => {
    createdAddresses.push(data);
    return { id: `addr-new-${createdAddresses.length}`, ...data };
  };
  addressDelegate.deleteMany = async ({ where }: any) => {
    deletedAddressQueries.push(where);
    const count = mockAddresses.filter((a) => a.id === where.id && a.userId === where.userId).length;
    return { count };
  };

  try {
    // 1. Unauthenticated GET returns 401
    const unauthRes = await customerAddressesGet(new NextRequest('http://localhost/api/customer/addresses'));
    assert.equal(unauthRes.status, 401, 'Unauthenticated addresses GET must return 401');

    // 2. Unauthenticated GET with phone query param is strictly rejected with 401
    const phoneBypassRes = await customerAddressesGet(
      new NextRequest('http://localhost/api/customer/addresses?phone=9999922222')
    );
    assert.equal(phoneBypassRes.status, 401, 'Phone query parameter must not bypass authentication');

    // 3. Authenticated customer GET only queries addresses for authenticated userId
    const c1Token = createCustomerToken('cust-u1', '9999911111');
    const c1Res = await customerAddressesGet(
      new NextRequest('http://localhost/api/customer/addresses', {
        headers: { Cookie: `jio_token=${c1Token}` },
      })
    );
    assert.equal(c1Res.status, 200);
    const c1Data = await c1Res.json();
    assert.equal(c1Data.data.length, 1);
    assert.equal(c1Data.data[0].id, 'addr-c1');
    assert.equal(queriedUserIds[0], 'cust-u1');

    // 4. Authenticated POST strictly binds address to authenticated caller
    const postRes = await customerAddressesPost(
      new NextRequest('http://localhost/api/customer/addresses', {
        method: 'POST',
        headers: {
          Cookie: `jio_token=${c1Token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          houseNo: '55',
          street: 'Outer Ring Rd',
          area: 'JP Nagar 7th Phase',
          pincode: '560078',
          phone: '9999922222', // Attempted forged phone
        }),
      })
    );
    assert.equal(postRes.status, 200);
    assert.equal(createdAddresses[0].userId, 'cust-u1', 'Address userId strictly matches caller');
    assert.equal(createdAddresses[0].phone, '9999911111', 'Address phone matches caller user record');

    // 5. Cross-customer address DELETE attempt fails with 404
    const deleteRes = await customerAddressesDelete(
      new NextRequest('http://localhost/api/customer/addresses?id=addr-c2', {
        method: 'DELETE',
        headers: { Cookie: `jio_token=${c1Token}` },
      })
    );
    assert.equal(deleteRes.status, 404, 'Deleting another customer address returns 404');
    assert.deepEqual(deletedAddressQueries[0], { id: 'addr-c2', userId: 'cust-u1' });
    console.log('✓ Stage 7 saved addresses security assertions passed.');
  } finally {
    addressDelegate.findMany = origAddressFindMany;
    addressDelegate.create = origAddressCreate;
    addressDelegate.deleteMany = origAddressDeleteMany;
    userDelegate.findUnique = origUserFindUnique;
  }

  console.log('--- Testing Stage 8: Transaction Boundaries & P2028 Resilience ---');
  const origServiceAreaFindMany = (db as any).serviceArea?.findMany;
  const origWasteCategoryFindMany = (db as any).wasteCategory?.findMany;
  const origCouponFindUnique = (db as any).coupon?.findUnique;
  const origOrderFindFirst = (db as any).order?.findFirst;
  const origTx = (db as any).$transaction;
  const origAddressUpdateMany = (db as any).address?.updateMany;

  let capturedTxOptions: any = null;
  let txCallCount = 0;
  let simulatedP2028 = false;

  (db as any).serviceArea = {
    findMany: async () => [
      {
        id: 'area-jpn',
        name: 'JP Nagar',
        status: 'ACTIVE',
        boundaryPolygon: '[[12.9,77.5],[13.0,77.5],[13.0,77.6],[12.9,77.6]]',
        etaMinutes: 20,
        basePickupCharge: 49,
      },
    ],
  };

  (db as any).wasteCategory = {
    findMany: async () => [
      { id: 'cat-paper', name: 'Paper & Cardboard', pricePerKg: 14, active: true },
      { id: 'cat-ewaste', name: 'E-Waste', pricePerKg: 45, active: true },
    ],
  };

  (db as any).address = {
    ...addressDelegate,
    updateMany: async () => ({ count: 0 }),
    create: async () => ({ id: 'addr-order-1' }),
  };

  (db as any).coupon = { findUnique: async () => null };
  (db as any).order = { findFirst: async () => null };

  const testBookingPayload = {
    phone: '9999911111',
    name: 'Alice Customer',
    address: {
      houseNo: '10',
      street: '1st Cross',
      area: 'JP Nagar',
      pincode: '560078',
      lat: 12.9077,
      lng: 77.5854,
    },
    items: [
      { categoryId: 'cat-paper', estimatedWeight: 5 },
      { categoryId: 'cat-ewaste', estimatedWeight: 2 },
    ],
    pickupType: 'ASAP' as const,
    scheduledSlot: null,
    financialDirection: 'CUSTOMER_PAYS' as const,
  };

  const bookingAuthUser = {
    userId: 'cust-u1',
    customerId: 'cust-p1',
  };

  (db as any).user.findUnique = async () => ({
    id: 'cust-u1',
    customer: { id: 'cust-p1' },
    role: 'CUSTOMER',
  });

  (db as any).$transaction = async (callback: (tx: any) => Promise<any>, options?: any) => {
    txCallCount += 1;
    capturedTxOptions = options;

    if (simulatedP2028) {
      const err: any = new Error(
        'Transaction API error: Transaction already closed: Transaction is no longer usable.'
      );
      err.code = 'P2028';
      throw err;
    }

    const tx = {
      order: {
        create: async ({ data }: any) => {
          return {
            id: 'ord-stg8-1',
            orderNumber: data.orderNumber,
            status: data.status,
            paymentStatus: data.paymentStatus,
            finalAmount: data.finalAmount,
            customerId: data.customerId,
            items: data.items?.create || [],
            statusHistory: data.statusHistory?.create ? [data.statusHistory.create] : [],
          };
        },
      },
    };
    return callback(tx);
  };

  try {
    // 1. Successful order creation exercises atomic transaction with explicit bounded options
    const orderKey = `stg8_key_${Date.now()}`;
    const created = await createOrder(testBookingPayload, orderKey, bookingAuthUser);
    assert.ok(created?.id, 'Order created successfully');
    assert.equal(created.items.length, 2, 'Nested items created atomically with order');
    assert.equal(created.statusHistory.length, 1, 'Initial statusHistory created atomically');
    assert.deepEqual(
      capturedTxOptions,
      { maxWait: 5000, timeout: 15000 },
      'Transaction options must have bounded maxWait and timeout (not infinite or arbitrarily large)'
    );

    // 2. Simulate Prisma P2028 transaction timeout: verify failure does not pollute idempotency store
    simulatedP2028 = true;
    const failingKey = `stg8_fail_key_${Date.now()}`;
    let threwP2028 = false;
    try {
      await createOrder(testBookingPayload, failingKey, bookingAuthUser);
    } catch (err: any) {
      threwP2028 = true;
      assert.equal(err.code, 'P2028');
    }
    assert.equal(threwP2028, true, 'Prisma P2028 error must be thrown on transaction timeout');

    // 3. Immediately retry after recovery: since failed attempt was not cached, retry succeeds cleanly
    simulatedP2028 = false;
    const recovered = await createOrder(testBookingPayload, failingKey, bookingAuthUser);
    assert.ok(recovered?.id, 'Retry with same key succeeds after transient P2028 recovery');
    console.log('✓ Stage 8 transaction boundary & P2028 timeout assertions passed.');
  } finally {
    if (origServiceAreaFindMany) (db as any).serviceArea.findMany = origServiceAreaFindMany;
    if (origWasteCategoryFindMany) (db as any).wasteCategory.findMany = origWasteCategoryFindMany;
    if (origCouponFindUnique) (db as any).coupon.findUnique = origCouponFindUnique;
    if (origOrderFindFirst) (db as any).order.findFirst = origOrderFindFirst;
    (db as any).$transaction = origTx;
    if (origAddressUpdateMany) (db as any).address.updateMany = origAddressUpdateMany;
  }

  console.log('--- Testing Stage 9: Customer SSE Stream Access & Ownership ---');
  // 1. Unauthenticated SSE request returns 401
  const unauthStreamReq = new NextRequest('http://localhost/api/customer/stream?orderId=order-123');
  const unauthStreamRes = await customerStreamRoute(unauthStreamReq);
  assert.equal(unauthStreamRes.status, 401, 'Unauthenticated SSE stream must return 401');

  // 2. Customer accessing another customer order returns 404
  const orderDelegate = (db as any).order;
  const originalFindFirst = orderDelegate.findFirst;
  orderDelegate.findFirst = async () => null; // Not found under this customer

  try {
    const customerToken = createCustomerToken('customer-uid-99', '9999911111', 'cust-prof-99');
    const forbiddenStreamReq = new NextRequest('http://localhost/api/customer/stream?orderId=foreign-order', {
      headers: { Cookie: `jio_token=${customerToken}` },
    });
    const forbiddenStreamRes = await customerStreamRoute(forbiddenStreamReq);
    assert.equal(forbiddenStreamRes.status, 404, 'Stream for unowned order returns 404');
    console.log('✓ Stage 9 SSE stream security assertions passed.');
  } finally {
    orderDelegate.findFirst = originalFindFirst;
  }

  console.log('\nALL STAGES 5-9 UNIT AND INTEGRATION ASSERTIONS PASSED.');
}

void testStages5Through9().catch((err) => {
  console.error('Stages 5-9 tests failed:', err);
  process.exit(1);
});
