import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET, POST, DELETE } from '../app/api/customer/addresses/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'local-test-secret-at-least-32-bytes-long-for-jwt-security';

function createCustomerToken(userId: string, phone: string) {
  return signToken({
    userId,
    phone,
    role: 'CUSTOMER',
    customerId: `cust-${userId}`,
  });
}

function createAgentToken(userId: string) {
  return signToken({
    userId,
    phone: '9876543210',
    role: 'AGENT',
    agentId: `agent-${userId}`,
  });
}

async function testCustomerAddressesSecurity() {
  const addressDelegate = db.address as any;
  const userDelegate = db.user as any;

  const originalFindMany = addressDelegate.findMany;
  const originalCreate = addressDelegate.create;
  const originalUpdateMany = addressDelegate.updateMany;
  const originalDeleteMany = addressDelegate.deleteMany;
  const originalFindUnique = userDelegate.findUnique;
  const originalTransaction = (db as any).$transaction;

  const queriedUserIds: string[] = [];
  const createdAddresses: any[] = [];
  const deletedAddressQueries: any[] = [];

  const mockAddresses = [
    { id: 'addr-1', userId: 'cust-1', label: 'Home', houseNo: '101', street: '1st Cross', area: 'JP Nagar' },
    { id: 'addr-2', userId: 'cust-2', label: 'Work', houseNo: '202', street: '2nd Cross', area: 'Jayanagar' },
  ];

  addressDelegate.findMany = async ({ where }: any) => {
    queriedUserIds.push(where.userId);
    return mockAddresses.filter((a) => a.userId === where.userId);
  };

  userDelegate.findUnique = async ({ where }: any) => {
    if (where.id === 'cust-1') {
      return { id: 'cust-1', phone: '9999911111', name: 'Alice Customer' };
    }
    if (where.id === 'cust-2') {
      return { id: 'cust-2', phone: '9999922222', name: 'Bob Customer' };
    }
    return null;
  };

  addressDelegate.create = async ({ data }: any) => {
    createdAddresses.push(data);
    return { id: `addr-new-${createdAddresses.length}`, ...data };
  };

  addressDelegate.updateMany = async () => ({ count: 1 });
  (db as any).$transaction = async (cb: any) => cb(db);

  addressDelegate.deleteMany = async ({ where }: any) => {
    deletedAddressQueries.push(where);
    const count = mockAddresses.filter((a) => a.id === where.id && a.userId === where.userId).length;
    return { count };
  };

  try {
    // 1. Unauthenticated GET returns 401
    const unauthGetReq = new NextRequest('http://localhost/api/customer/addresses');
    const unauthGetRes = await GET(unauthGetReq);
    assert.equal(unauthGetRes.status, 401, 'Unauthenticated GET /api/customer/addresses must return 401');

    // 2. Unauthenticated GET with phone query parameter returns 401 (no phone bypass)
    const phoneBypassReq = new NextRequest('http://localhost/api/customer/addresses?phone=9999922222');
    const phoneBypassRes = await GET(phoneBypassReq);
    assert.equal(phoneBypassRes.status, 401, 'Unauthenticated GET with phone query param must return 401');
    assert.equal(queriedUserIds.length, 0, 'No address queries made for unauthenticated requests');

    // 3. Agent role GET returns 401
    const agentToken = createAgentToken('agent-1');
    const agentGetReq = new NextRequest('http://localhost/api/customer/addresses', {
      headers: { Cookie: `jio_token=${agentToken}` },
    });
    const agentGetRes = await GET(agentGetReq);
    assert.equal(agentGetRes.status, 401, 'Non-customer roles must return 401');

    // 4. Authenticated Customer 1 GET returns ONLY Customer 1 addresses
    const cust1Token = createCustomerToken('cust-1', '9999911111');
    const cust1GetReq = new NextRequest('http://localhost/api/customer/addresses', {
      headers: { Cookie: `jio_token=${cust1Token}` },
    });
    const cust1GetRes = await GET(cust1GetReq);
    assert.equal(cust1GetRes.status, 200);
    const cust1Data = await cust1GetRes.json();
    assert.equal(cust1Data.success, true);
    assert.equal(cust1Data.data.length, 1);
    assert.equal(cust1Data.data[0].id, 'addr-1');
    assert.equal(queriedUserIds[0], 'cust-1');

    // 5. Authenticated Customer 1 passing another customer's phone in query is IGNORED
    const forgedPhoneGetReq = new NextRequest('http://localhost/api/customer/addresses?phone=9999922222', {
      headers: { Cookie: `jio_token=${cust1Token}` },
    });
    const forgedPhoneGetRes = await GET(forgedPhoneGetReq);
    assert.equal(forgedPhoneGetRes.status, 200);
    const forgedData = await forgedPhoneGetRes.json();
    assert.equal(forgedData.data[0].id, 'addr-1', 'Returns caller address only, ignoring forged phone parameter');
    assert.equal(queriedUserIds[1], 'cust-1', 'DB query scoped strictly to authenticated session userId');

    // 6. Unauthenticated POST returns 401
    const unauthPostReq = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ houseNo: '10', street: 'MG Road', area: 'Central' }),
    });
    const unauthPostRes = await POST(unauthPostReq);
    assert.equal(unauthPostRes.status, 401, 'Unauthenticated POST must return 401');

    // 7. Authenticated POST strictly binds address to session user and rejects spoofed phone/userId
    const cust1PostReq = new NextRequest('http://localhost/api/customer/addresses', {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${cust1Token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        label: 'Office',
        houseNo: '500',
        street: 'Bannerghatta Rd',
        area: 'JP Nagar 4th Phase',
        pincode: '560076',
        lat: 12.9081,
        lng: 77.5852,
        phone: '9999922222', // Attempted forged phone of customer 2
        userId: 'cust-2',    // Attempted forged userId
      }),
    });
    const cust1PostRes = await POST(cust1PostReq);
    assert.equal(cust1PostRes.status, 200);
    const savedPost = createdAddresses[0];
    assert.equal(savedPost.userId, 'cust-1', 'Saved address is strictly bound to session userId');
    assert.equal(savedPost.phone, '9999911111', 'Saved address phone comes from user record, not forged body');

    // 8. Cross-customer address DELETE attempt fails with 404 (address not found under session user)
    const cust1DeleteReq = new NextRequest('http://localhost/api/customer/addresses?id=addr-2', {
      method: 'DELETE',
      headers: { Cookie: `jio_token=${cust1Token}` },
    });
    const cust1DeleteRes = await DELETE(cust1DeleteReq);
    assert.equal(cust1DeleteRes.status, 404, 'Cannot delete an address belonging to another user');
    assert.equal(deletedAddressQueries.length, 1);
    assert.equal(deletedAddressQueries[0].id, 'addr-2');
    assert.equal(deletedAddressQueries[0].userId, 'cust-1', 'Delete query scoped strictly to session user');

    // 9. Legitimate owner DELETE succeeds with 200
    const legitDeleteReq = new NextRequest('http://localhost/api/customer/addresses?id=addr-1', {
      method: 'DELETE',
      headers: { Cookie: `jio_token=${cust1Token}` },
    });
    const legitDeleteRes = await DELETE(legitDeleteReq);
    assert.equal(legitDeleteRes.status, 200);

    console.log('Customer addresses security tests passed successfully.');
  } finally {
    addressDelegate.findMany = originalFindMany;
    addressDelegate.create = originalCreate;
    addressDelegate.updateMany = originalUpdateMany;
    addressDelegate.deleteMany = originalDeleteMany;
    userDelegate.findUnique = originalFindUnique;
    (db as any).$transaction = originalTransaction;
  }
}

void testCustomerAddressesSecurity().catch((err) => {
  console.error('Customer addresses security test failed:', err);
  process.exit(1);
});
