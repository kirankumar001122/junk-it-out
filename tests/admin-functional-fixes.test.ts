import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return require.resolve('../package.json');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

process.env.JWT_SECRET = 'admin-functional-fixes-secret';

async function run() {
  const { NextRequest } = await import('next/server');
  const { GET: getStats } = await import('../app/api/admin/stats/route');
  const { GET: getPricing, PUT: updatePricing } = await import('../app/api/admin/pricing/route');
  const { GET: getSettings, PUT: updateSettings } = await import('../app/api/admin/settings/route');
  const { GET: getCategories, PUT: updateCategory } = await import('../app/api/waste-categories/route');
  const { db } = await import('../lib/db');
  const { signToken } = await import('../lib/auth/jwt');

  const adminToken = signToken({
    userId: 'admin-user-1',
    phone: '7676272709',
    name: 'Admin Tester',
    role: 'ADMIN',
  });

  const customerToken = signToken({
    userId: 'customer-user-1',
    phone: '9888877777',
    name: 'Customer Tester',
    role: 'CUSTOMER',
    customerId: 'cust-1',
  });

  function makeReq(url: string, method: string, token?: string, body?: unknown) {
    return new NextRequest(`http://localhost${url}`, {
      method,
      headers: {
        ...(token ? { Cookie: `jio_token=${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  console.log('Testing Admin Functional Fixes & Data Accuracy...');

  // 1. STATS ROUTE - Accurate completedOrders and completedPickups mapping
  {
    const originalOrderCount = db.order.count;
    const originalOrderGroupBy = db.order.groupBy;
    const originalOrderFindMany = db.order.findMany;
    const originalAgentCount = db.agent.count;
    const originalAgentGroupBy = db.agent.groupBy;
    const originalCustomerCount = db.customer.count;
    const originalOrderItemAgg = db.orderItem.aggregate;
    const originalPaymentAgg = db.payment.aggregate;
    const originalSettlementAgg = db.settlement.aggregate;
    const originalSettlementGroupBy = db.settlement.groupBy;

    (db.order as any).groupBy = async () => [
      { status: 'PICKUP_COMPLETED', _count: { _all: 15 } },
      { status: 'BOOKING_RECEIVED', _count: { _all: 27 } },
    ];
    (db.agent as any).groupBy = async () => [
      { status: 'AVAILABLE', _count: { _all: 8 } },
    ];
    (db.settlement as any).groupBy = async () => [
      { status: 'PAID', _sum: { amount: 1200.0 } },
    ];
    (db.order as any).count = async (args?: any) => {
      if (args?.where?.status?.in?.includes('PICKUP_COMPLETED')) return 15;
      return 42;
    };
    (db.order as any).findMany = async () => [];
    (db.agent as any).count = async () => 8;
    (db.customer as any).count = async () => 50;
    (db.orderItem as any).aggregate = async () => ({ _sum: { actualWeight: 350.5 } });
    (db.payment as any).aggregate = async () => ({ _sum: { amount: 5000.0 } });
    (db.settlement as any).aggregate = async () => ({ _sum: { amount: 1200.0 } });

    try {
      const res = await getStats(makeReq('/api/admin/stats', 'GET', adminToken));
      const data = await res.json();
      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.equal(data.data.completedPickups, 15);
      assert.equal(data.data.completedOrders, 15);
      assert.equal(data.data.totalWeightKg, 350.5);
      console.log('PASS: /api/admin/stats accurately includes completedOrders and completedPickups.');
    } finally {
      db.order.count = originalOrderCount;
      db.order.groupBy = originalOrderGroupBy;
      db.order.findMany = originalOrderFindMany;
      db.agent.count = originalAgentCount;
      db.agent.groupBy = originalAgentGroupBy;
      db.customer.count = originalCustomerCount;
      db.orderItem.aggregate = originalOrderItemAgg;
      db.payment.aggregate = originalPaymentAgg;
      db.settlement.aggregate = originalSettlementAgg;
      db.settlement.groupBy = originalSettlementGroupBy;
    }
  }

  // 2. PRICING ROUTE - Rejection for non-admin & successful persistence with audit logging
  {
    // Customer access rejected
    const custRes = await getPricing(makeReq('/api/admin/pricing', 'GET', customerToken));
    assert.equal(custRes.status, 403);

    // Admin GET
    const getRes = await getPricing(makeReq('/api/admin/pricing', 'GET', adminToken));
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);
    assert.equal(typeof getData.data.basePickupCharge, 'number');

    // Admin PUT with audit write stub
    const auditCreated: any[] = [];
    const origAuditCreate = db.auditLog.create;
    const origServiceAreaUpdate = db.serviceArea.updateMany;
    (db.auditLog as any).create = async (args: any) => {
      auditCreated.push(args.data);
      return { id: 'audit-1', ...args.data };
    };
    (db.serviceArea as any).updateMany = async () => ({ count: 5 });

    try {
      const putRes = await updatePricing(
        makeReq('/api/admin/pricing', 'PUT', adminToken, {
          basePickupCharge: 59,
          urgentSurcharge: 35,
        })
      );
      assert.equal(putRes.status, 200);
      const putData = await putRes.json();
      assert.equal(putData.data.basePickupCharge, 59);
      assert.equal(putData.data.urgentSurcharge, 35);
      assert.equal(auditCreated.length, 1);
      assert.equal(auditCreated[0].action, 'UPDATE_PRICING_RULES');
      console.log('PASS: /api/admin/pricing enforces role check and records immutable audit log.');
    } finally {
      db.auditLog.create = origAuditCreate;
      db.serviceArea.updateMany = origServiceAreaUpdate;
    }
  }

  // 3. SETTINGS ROUTE - Rejection for non-admin & successful persistence with audit logging
  {
    // Customer access rejected
    const custRes = await getSettings(makeReq('/api/admin/settings', 'GET', customerToken));
    assert.equal(custRes.status, 403);

    // Admin GET
    const getRes = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.success, true);

    // Admin PUT with audit write stub
    const auditCreated: any[] = [];
    const origAuditCreate = db.auditLog.create;
    (db.auditLog as any).create = async (args: any) => {
      auditCreated.push(args.data);
      return { id: 'audit-2', ...args.data };
    };

    try {
      const putRes = await updateSettings(
        makeReq('/api/admin/settings', 'PUT', adminToken, {
          companyName: 'Junk It Out Pvt Ltd Updated',
          dispatchSlaMinutes: 25,
        })
      );
      assert.equal(putRes.status, 200);
      const putData = await putRes.json();
      assert.equal(putData.data.companyName, 'Junk It Out Pvt Ltd Updated');
      assert.equal(putData.data.dispatchSlaMinutes, 25);
      assert.equal(auditCreated.length, 1);
      assert.equal(auditCreated[0].action, 'UPDATE_SYSTEM_SETTINGS');
      console.log('PASS: /api/admin/settings enforces role check and records immutable audit log.');
    } finally {
      db.auditLog.create = origAuditCreate;
    }
  }

  // 4. WASTE CATEGORIES - Activation & Customer Visibility Isolation
  {
    const origFindMany = db.wasteCategory.findMany;
    const origUpdate = db.wasteCategory.update;
    const origAuditCreate = db.auditLog.create;

    const mockCategories = [
      { id: 'cat-1', name: 'Plastic Waste', active: true, pricePerKg: 18, type: 'RECYCLABLE_BUY', description: 'Plastic scrap', icon: 'Recycle', minWeightKg: 1, maxWeightKg: 500 },
      { id: 'cat-2', name: 'Paper & Cardboard', active: false, pricePerKg: 14, type: 'RECYCLABLE_BUY', description: 'Paper scrap', icon: 'FileText', minWeightKg: 1, maxWeightKg: 500 },
    ];

    (db.wasteCategory as any).findMany = async () => mockCategories;

    try {
      // Invalidate cache first
      const { invalidateCategoriesCache } = await import('../app/api/waste-categories/route');
      invalidateCategoriesCache();

      // Customer view (?customer=true) should only see active customer categories
      const custRes = await getCategories(makeReq('/api/waste-categories?customer=true', 'GET'));
      const custData = await custRes.json();
      assert.equal(custRes.status, 200);
      assert.equal(custData.data.length, 1);
      assert.equal(custData.data[0].id, 'cat-1');
      assert.equal(custData.data[0].active, true);

      // Admin view (without ?customer=true) sees both active and inactive categories
      invalidateCategoriesCache();
      const adminRes = await getCategories(makeReq('/api/waste-categories', 'GET', adminToken));
      const adminData = await adminRes.json();
      assert.equal(adminRes.status, 200);
      assert.equal(adminData.data.length, 2);
      console.log('PASS: Deactivated categories are excluded from customer listing while remaining visible in admin catalog.');
    } finally {
      db.wasteCategory.findMany = origFindMany;
      db.wasteCategory.update = origUpdate;
      db.auditLog.create = origAuditCreate;
    }
  }

  console.log('ALL ADMIN FUNCTIONAL FIXES TESTS PASSED SUCCESSFULLY.');
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

