import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getAdminStats } from '../app/api/admin/stats/route';
import { GET as getOrders } from '../app/api/orders/route';
import { GET as getAdminReports } from '../app/api/admin/reports/route';
import { GET as getWasteCategories, DELETE as deleteWasteCategory } from '../app/api/waste-categories/route';
import { GET as getAdminCoupons, POST as postAdminCoupon, PUT as putAdminCoupon, DELETE as deleteAdminCoupon } from '../app/api/admin/coupons/route';
import { POST as validateCouponRoute } from '../app/api/coupons/validate/route';
import { validateAndCalculateCoupon } from '../lib/services/couponService';
import { setCachedWasteCategories, getCachedWasteCategories, invalidateCategoriesCache } from '../lib/cache/wasteCategoriesCache';
import { invalidateAdminStatsCache } from '../lib/cache/adminStatsCache';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

async function run() {
  const adminToken = signToken({
    userId: 'admin-perf-1',
    phone: '7676272709',
    role: 'ADMIN',
  });

  const adminHeaders = {
    Cookie: `jio_token=${adminToken}`,
    'Cache-Control': 'no-cache',
  };

  try {
    console.log('--- TEST 1: Admin Stats Failure Handling & Separation ---');
    {
      invalidateAdminStatsCache();
      const req = new NextRequest('http://localhost/api/admin/stats', { headers: adminHeaders });

      // Test 1a: Successful aggregation returns separate payout figures
      const res = await getAdminStats(req);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
      const data = json.data;

      assert(typeof data.totalRevenue === 'number', 'totalRevenue must be a number');
      assert(typeof data.paidCustomerPayouts === 'number', 'paidCustomerPayouts must be a number');
      assert(typeof data.approvedCustomerPayouts === 'number', 'approvedCustomerPayouts must be a number');
      assert(typeof data.pendingCustomerPayouts === 'number', 'pendingCustomerPayouts must be a number');
      assert(typeof data.totalCustomerSettlements === 'number', 'totalCustomerSettlements must be a number');
      assert.equal(data.totalCustomerPayouts, data.paidCustomerPayouts, 'totalCustomerPayouts must equal paidCustomerPayouts strictly');

      // Test 1b: Pickup counts follow lifecycle
      assert(data.pendingBookings !== undefined, 'pendingBookings must exist');
      assert(data.activePickups !== undefined, 'activePickups must exist');
      assert.equal(data.assignedPickups, data.activePickups, 'assignedPickups must equal activePickups in progress');
    }

    console.log('--- TEST 2: Admin Orders Server-Side Search & Pagination ---');
    {
      // Test 2a: Pagination metadata is present
      const reqPage = new NextRequest('http://localhost/api/orders?page=1&limit=10', { headers: adminHeaders });
      const resPage = await getOrders(reqPage);
      assert.equal(resPage.status, 200);
      const jsonPage = await resPage.json();
      assert.equal(jsonPage.success, true);
      assert(Array.isArray(jsonPage.data), 'orders data must be an array');
      assert(jsonPage.meta, 'meta pagination must be returned');
      assert.equal(jsonPage.meta.page, 1);
      assert.equal(jsonPage.meta.limit, 10);
      assert(typeof jsonPage.meta.total === 'number');
      assert(typeof jsonPage.meta.totalPages === 'number');

      // Test 2b: Search and status query parameters work
      const reqSearch = new NextRequest('http://localhost/api/orders?search=JIO-NONEXISTENT-99999&status=CANCELLED', { headers: adminHeaders });
      const resSearch = await getOrders(reqSearch);
      assert.equal(resSearch.status, 200);
      const jsonSearch = await resSearch.json();
      assert.equal(jsonSearch.success, true);
      assert.equal(jsonSearch.data.length, 0, 'nonexistent search query must return empty array without error');
    }

    console.log('--- TEST 3: Coupon Lifecycle, Deletion & DB Error Handling ---');
    {
      // Test 3a: Coupon service returns isDbError when DB lookup fails
      const originalFindUnique = db.coupon.findUnique;
      (db.coupon as any).findUnique = async () => {
        throw new Error('Connection pool exhausted');
      };

      try {
        const dbErrResult = await validateAndCalculateCoupon('TEST50', 500);
        assert.equal(dbErrResult.valid, false);
        assert.equal(dbErrResult.isDbError, true, 'must set isDbError flag on DB failure');

        const validateReq = new NextRequest('http://localhost/api/coupons/validate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: 'TEST50', subtotal: 500 }),
        });
        const validateRes = await validateCouponRoute(validateReq);
        assert.equal(validateRes.status, 503, 'must return 503 Service Unavailable on DB failure, not 400 invalid coupon');
      } finally {
        (db.coupon as any).findUnique = originalFindUnique;
      }

      // Test 3b: Inactive and expired coupons cannot be applied
      const originalFindUniqueCoupon = db.coupon.findUnique;
      (db.coupon as any).findUnique = async ({ where }: any) => {
        if (where.code === 'INACTIVE10') {
          return { id: 'c-inactive', code: 'INACTIVE10', active: false, discountType: 'FLAT', discountValue: 10, minOrderValue: 50 };
        }
        if (where.code === 'EXPIRED10') {
          return { id: 'c-expired', code: 'EXPIRED10', active: true, expiryDate: new Date('2020-01-01'), discountType: 'FLAT', discountValue: 10, minOrderValue: 50 };
        }
        return null;
      };

      try {
        const inactiveResult = await validateAndCalculateCoupon('INACTIVE10', 200);
        assert.equal(inactiveResult.valid, false);
        assert(inactiveResult.error?.includes('no longer active'));

        const expiredResult = await validateAndCalculateCoupon('EXPIRED10', 200);
        assert.equal(expiredResult.valid, false);
        assert(expiredResult.error?.includes('expired'));
      } finally {
        (db.coupon as any).findUnique = originalFindUniqueCoupon;
      }

      // Test 3c: Admin coupons DELETE endpoint exists and functions
      const reqDeleteCoupon = new NextRequest('http://localhost/api/admin/coupons?id=non-existent-coupon', {
        headers: adminHeaders,
      });
      const resDeleteCoupon = await deleteAdminCoupon(reqDeleteCoupon);
      assert.equal(resDeleteCoupon.status, 404, 'Deleting non-existent coupon should return 404');
    }

    console.log('--- TEST 4: Waste Categories Cache & Mutation Freshness ---');
    {
      invalidateCategoriesCache();
      const initialList = [
        { id: 'cat-1', name: 'Plastic', active: true },
        { id: 'cat-2', name: 'Paper', active: true },
      ];
      setCachedWasteCategories(initialList);
      assert.deepEqual(getCachedWasteCategories(), initialList);

      // When new categories are set (e.g. after category deletion), old stale categories must NOT accumulate
      const updatedList = [
        { id: 'cat-1', name: 'Plastic', active: true },
      ];
      setCachedWasteCategories(updatedList);
      const afterCache = getCachedWasteCategories();
      assert.equal(afterCache?.length, 1, 'Cache must not retain deleted cat-2');
      assert.equal(afterCache?.[0]?.id, 'cat-1');

      invalidateCategoriesCache();
      assert.equal(getCachedWasteCategories(), null);

      // Test Delete Waste Category endpoint
      const reqDeleteCat = new NextRequest('http://localhost/api/waste-categories?id=non-existent-cat', {
        headers: adminHeaders,
      });
      const resDeleteCat = await deleteWasteCategory(reqDeleteCat);
      assert.equal(resDeleteCat.status, 404, 'Deleting non-existent category should return 404');
    }

    console.log('--- TEST 5: CSV Export Limit and Date Validation ---');
    {
      // Limit > 50000 rejected
      const reqOverLimit = new NextRequest('http://localhost/api/admin/reports?limit=100000', {
        headers: adminHeaders,
      });
      const resOverLimit = await getAdminReports(reqOverLimit);
      assert.equal(resOverLimit.status, 400, 'Limit > 50000 must be rejected with 400');

      // Invalid date rejected
      const reqBadDate = new NextRequest('http://localhost/api/admin/reports?startDate=not-a-date', {
        headers: adminHeaders,
      });
      const resBadDate = await getAdminReports(reqBadDate);
      assert.equal(resBadDate.status, 400, 'Invalid startDate must be rejected with 400');
    }

    console.log('\nAll Admin Dashboard, Reports, Coupons & Performance tests passed successfully! 🎉');
  } finally {
    await db.$disconnect();
  }
}

void run();
