import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getReports } from '../app/api/admin/reports/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

async function run() {
  const orderDelegate = db.order as any;
  const originalOrderFindMany = orderDelegate.findMany;

  try {
    const adminToken = signToken({
      userId: 'admin-1',
      phone: '7676272709',
      role: 'ADMIN',
    });

    const customerToken = signToken({
      userId: 'cust-1',
      phone: '9999999999',
      role: 'CUSTOMER',
    });

    // -------------------------------------------------------------
    // TEST 1: Authorization
    // -------------------------------------------------------------
    {
      const unauthReq = new NextRequest('http://localhost/api/admin/reports');
      assert.equal((await getReports(unauthReq)).status, 401, 'unauthenticated must return 401');

      const custReq = new NextRequest('http://localhost/api/admin/reports', {
        headers: { Cookie: `jio_token=${customerToken}` },
      });
      assert.equal((await getReports(custReq)).status, 403, 'customer must return 403');
    }

    // -------------------------------------------------------------
    // TEST 2: Lean Selection, Sensitive Field & Unused Join Exclusion
    // -------------------------------------------------------------
    {
      let capturedArgs: any = null;
      orderDelegate.findMany = async (args: any) => {
        capturedArgs = args;
        return [];
      };

      const req = new NextRequest('http://localhost/api/admin/reports', {
        headers: { Cookie: `jio_token=${adminToken}` },
      });

      const res = await getReports(req);
      assert.equal(res.status, 200);

      assert(capturedArgs.select, 'must use select projection rather than broad include');
      assert.equal(capturedArgs.include, undefined, 'include must NOT be used');

      // Assert items and category are NOT selected
      assert.equal(capturedArgs.select.items, undefined, 'OrderItem relation must not be joined');
      assert.equal(capturedArgs.select.wasteCategory, undefined, 'WasteCategory relation must not be joined');

      // Assert bulky/sensitive fields are excluded
      assert.equal(capturedArgs.select.wastePhotos, undefined, 'wastePhotos must not be selected');
      assert.equal(capturedArgs.select.customer.select.user.select.passwordHash, undefined, 'passwordHash must not be selected');
      assert.equal(capturedArgs.select.agent.select.user.select.passwordHash, undefined, 'passwordHash must not be selected');

      // Assert only minimal fields are selected
      assert.deepEqual(capturedArgs.select.customer.select.user.select, { name: true, phone: true });
      assert.deepEqual(capturedArgs.select.agent.select.user.select, { name: true });
      assert.deepEqual(capturedArgs.select.address.select, { area: true });
    }

    // -------------------------------------------------------------
    // TEST 3: CSV Format, Column Order, and Formula-Injection Neutralization
    // -------------------------------------------------------------
    {
      const mockOrder = {
        id: 'ord-csv-1',
        orderNumber: 'JIO-CSV-999',
        createdAt: new Date('2026-10-23T10:00:00.000Z'),
        status: 'PICKUP_COMPLETED',
        estimatedTotal: 150.0,
        finalAmount: 145.0,
        customer: {
          user: {
            name: '=CMD("calc.exe")', // Dangerous formula injection payload
            phone: '+919876543210',  // Leading plus payload
          },
        },
        agent: {
          user: {
            name: '@SUPER_ADMIN',   // Leading @ payload
          },
        },
        address: {
          area: '-SOUTH_ZONE',      // Leading minus payload
        },
      };

      orderDelegate.findMany = async () => [mockOrder];

      const req = new NextRequest('http://localhost/api/admin/reports', {
        headers: { Cookie: `jio_token=${adminToken}` },
      });

      const res = await getReports(req);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('Content-Type'), 'text/csv');
      assert(res.headers.get('Content-Disposition')?.startsWith('attachment; filename=junkitout_orders_report_'));

      const csv = await res.text();
      const lines = csv.split('\n');

      // Assert Headers
      assert.equal(
        lines[0],
        '"Order Number","Date","Customer Name","Phone","Area","Status","Estimated Total","Final Amount","Agent Name"',
        'CSV header row must match expected column contract',
      );

      // Assert Formula Injection Escaping
      const dataRow = lines[1];
      assert(dataRow.includes(`"'=CMD(""calc.exe"")"`), 'formula injection with = must be prepended with single quote');
      assert(dataRow.includes(`"'+919876543210"`), 'leading + must be prepended with single quote');
      assert(dataRow.includes(`"'-SOUTH_ZONE"`), 'leading - must be prepended with single quote');
      assert(dataRow.includes(`"'@SUPER_ADMIN"`), 'leading @ must be prepended with single quote');
      assert(dataRow.includes('"JIO-CSV-999"'));
      assert(dataRow.includes('"PICKUP_COMPLETED"'));
    }

    // -------------------------------------------------------------
    // TEST 4: Bounded Batching / Cursor Pagination Without Missing or Duplicate Rows
    // -------------------------------------------------------------
    {
      const totalRecords = 1200; // 3 batches: 500, 500, 200
      const allOrders = Array.from({ length: totalRecords }, (_, i) => ({
        id: `ord-batch-${i + 1}`,
        orderNumber: `JIO-BATCH-${String(i + 1).padStart(4, '0')}`,
        createdAt: new Date(Date.now() - i * 1000),
        status: 'COMPLETED',
        estimatedTotal: 100,
        finalAmount: 100,
        customer: { user: { name: `Customer ${i + 1}`, phone: '9999999999' } },
        agent: { user: { name: `Agent ${i + 1}` } },
        address: { area: 'JP Nagar' },
      }));

      let findManyCallCount = 0;
      orderDelegate.findMany = async ({ take, cursor, skip }: any) => {
        findManyCallCount += 1;
        let startIndex = 0;
        if (cursor?.id) {
          const prevIndex = allOrders.findIndex((o) => o.id === cursor.id);
          startIndex = prevIndex + (skip ?? 0);
        }
        return allOrders.slice(startIndex, startIndex + take);
      };

      const req = new NextRequest('http://localhost/api/admin/reports', {
        headers: { Cookie: `jio_token=${adminToken}` },
      });

      const res = await getReports(req);
      assert.equal(res.status, 200);

      const csv = await res.text();
      const lines = csv.split('\n');

      assert.equal(lines.length, totalRecords + 1, 'CSV must contain 1 header + 1200 data rows');
      assert.equal(findManyCallCount, 3, '1200 records with batch size 500 must query in exactly 3 batches');

      // Verify no duplicates and no missing rows
      const seenOrderNumbers = new Set<string>();
      for (let i = 1; i <= totalRecords; i++) {
        const orderNum = `JIO-BATCH-${String(i).padStart(4, '0')}`;
        assert(lines[i].includes(`"${orderNum}"`), `line ${i} should contain ${orderNum}`);
        seenOrderNumbers.add(orderNum);
      }
      assert.equal(seenOrderNumbers.size, totalRecords, 'all 1200 records must be unique with 0 duplicates');
    }

    console.log('Admin reports performance, projection, and CSV safety tests passed.');
  } finally {
    orderDelegate.findMany = originalOrderFindMany;
    await db.$disconnect();
  }
}

void run();
