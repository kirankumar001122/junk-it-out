import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getSettlements, PATCH as updateSettlement } from '../app/api/admin/settlements/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

async function run() {
  const settlementDelegate = db.settlement as any;
  const auditLogDelegate = db.auditLog as any;
  const originalFindMany = settlementDelegate.findMany;
  const originalUpdate = settlementDelegate.update;
  const originalAuditCreate = auditLogDelegate.create;

  let currentSettlement = {
    id: 'settlement-1',
    orderId: 'order-1',
    amount: 150.0,
    status: 'PENDING',
    createdAt: new Date(),
    approvedAt: null as Date | null,
    paidAt: null as Date | null,
    order: { orderNumber: 'JIO-TEST-1', items: [] },
    customer: { user: { name: 'Test Customer' } },
  };

  settlementDelegate.findMany = async () => [currentSettlement];
  settlementDelegate.update = async ({ where, data }: any) => {
    assert.equal(where.id, currentSettlement.id);
    currentSettlement = { ...currentSettlement, ...data };
    return currentSettlement;
  };
  auditLogDelegate.create = async () => ({ id: 'audit-1' });

  const adminToken = signToken({
    userId: 'admin-1',
    phone: '7676272709',
    role: 'ADMIN',
  });

  function makeRequest(body?: Record<string, unknown>, method = 'GET') {
    return new NextRequest('http://localhost/api/admin/settlements', {
      method,
      headers: {
        Cookie: `jio_token=${adminToken}`,
        'Content-Type': 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }

  try {
    // 1. Unauthenticated check (must return 401)
    const unauth = await getSettlements(new NextRequest('http://localhost/api/admin/settlements'));
    assert.equal(unauth.status, 401);

    // Non-admin check (must return 403)
    const custToken = signToken({ userId: 'c-1', phone: '9999999999', role: 'CUSTOMER' });
    const custReq = new NextRequest('http://localhost/api/admin/settlements', { headers: { Cookie: `jio_token=${custToken}` } });
    assert.equal((await getSettlements(custReq)).status, 403);

    // 2. Fetch settlements
    const listRes = await getSettlements(makeRequest());
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();
    assert.equal(listJson.data.length, 1);
    assert.equal(listJson.data[0].status, 'PENDING');

    // 3. Reject invalid status
    const invalidRes = await updateSettlement(makeRequest({ id: 'settlement-1', status: 'UNKNOWN_STATUS' }, 'PATCH'));
    assert.equal(invalidRes.status, 400);

    // 4. Update to APPROVED
    const approveRes = await updateSettlement(makeRequest({ id: 'settlement-1', status: 'APPROVED' }, 'PATCH'));
    assert.equal(approveRes.status, 200);
    assert.equal(currentSettlement.status, 'APPROVED');
    assert.ok(currentSettlement.approvedAt instanceof Date, 'approvedAt should be set on approval');

    // 5. Update to READY_FOR_PAYOUT
    const readyRes = await updateSettlement(makeRequest({ id: 'settlement-1', status: 'READY_FOR_PAYOUT' }, 'PATCH'));
    assert.equal(readyRes.status, 200);
    assert.equal(currentSettlement.status, 'READY_FOR_PAYOUT');

    // 6. Update to PAID
    const paidRes = await updateSettlement(makeRequest({ id: 'settlement-1', status: 'PAID' }, 'PATCH'));
    assert.equal(paidRes.status, 200);
    assert.equal(currentSettlement.status, 'PAID');
    assert.ok(currentSettlement.paidAt instanceof Date, 'paidAt should be set on payment');

    console.log('Admin settlements workflow tests passed.');
  } finally {
    settlementDelegate.findMany = originalFindMany;
    settlementDelegate.update = originalUpdate;
    auditLogDelegate.create = originalAuditCreate;
    await db.$disconnect();
  }
}

void run();
