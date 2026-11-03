import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return require.resolve('../package.json');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

const LOCAL_PG_URL = 'postgresql://postgres:Parthiv%40123@127.0.0.1:5433/parthiv_db?schema=public';
process.env.DATABASE_URL = LOCAL_PG_URL;
process.env.DIRECT_URL = LOCAL_PG_URL;
process.env.JWT_SECRET = 'test-cancellation-pg-secret-2026';

async function run() {
  const { PrismaClient } = await import('@prisma/client');
  const { NextRequest } = await import('next/server');
  const { POST: cancelOrder } = await import('../app/api/orders/[id]/cancel/route');
  const { signToken } = await import('../lib/auth/jwt');

  const prisma = new PrismaClient({
    datasources: { db: { url: LOCAL_PG_URL } },
  });

  const testId = randomUUID().slice(0, 8);
  const testUserId = `pg-cust-user-${testId}`;
  const testCustomerId = `pg-cust-${testId}`;
  const testAddressId = `pg-addr-${testId}`;
  const testOrderId = `pg-order-${testId}`;
  const testOrderNumber = `JIO-PG-${testId}`;
  const testPaymentId = `pg-pay-${testId}`;
  const testUserPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;

  console.log(`[PG Test] Connecting to PostgreSQL at ${LOCAL_PG_URL.split('@')[1]}...`);

  try {
    // 1. Verify connection and ensure schema prerequisites
    const [dbIdentity] = await prisma.$queryRaw<Array<{ current_database: string; current_user: string }>>`
      SELECT current_database(), current_user;
    `;
    assert.equal(dbIdentity.current_database, 'parthiv_db');
    console.log(`[PG Test] Connected to database: ${dbIdentity.current_database} as user: ${dbIdentity.current_user}`);

    // Ensure tokenVersion column exists on User
    await prisma.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 1;`);

    // Ensure RefundAttempt and RefundAttemptEvent tables exist (matching production payment setup)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefundAttempt" (
          "id" TEXT NOT NULL,
          "orderId" TEXT NOT NULL,
          "paymentId" TEXT NOT NULL,
          "razorpayRefundId" TEXT,
          "status" TEXT NOT NULL DEFAULT 'PENDING',
          "amount" DOUBLE PRECISION NOT NULL,
          "failureReason" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "RefundAttempt_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RefundAttempt_razorpayRefundId_key" ON "RefundAttempt"("razorpayRefundId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RefundAttempt_orderId_idx" ON "RefundAttempt"("orderId");`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "RefundAttempt_paymentId_idx" ON "RefundAttempt"("paymentId");`);
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefundAttemptEvent" (
          "id" TEXT NOT NULL,
          "refundAttemptId" TEXT NOT NULL,
          "eventType" TEXT NOT NULL,
          "status" TEXT,
          "details" JSONB,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "RefundAttemptEvent_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "RefundAttemptEvent_refundAttemptId_fkey" FOREIGN KEY ("refundAttemptId") REFERENCES "RefundAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
    `);

    // CRITICAL: Drop RefundRequest so we strictly reproduce the missing table condition in PostgreSQL
    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "RefundRequest" CASCADE;`);

    const tableCheck = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'RefundRequest';
    `;
    assert.equal(tableCheck.length, 0, 'RefundRequest table must not exist for this reproduction test');
    console.log('[PG Test] Verified: public.RefundRequest does NOT exist in PostgreSQL.');

    // 2. Create customer and order fixtures in real PostgreSQL
    await prisma.user.create({
      data: {
        id: testUserId,
        phone: testUserPhone,
        name: 'PG Test Customer',
        role: 'CUSTOMER',
      },
    });

    await prisma.customer.create({
      data: {
        id: testCustomerId,
        userId: testUserId,
      },
    });

    await prisma.address.create({
      data: {
        id: testAddressId,
        userId: testUserId,
        name: 'PG Customer',
        phone: testUserPhone,
        houseNo: '10',
        street: 'MG Road',
        area: 'Koramangala',
        pincode: '560034',
        lat: 12.93,
        lng: 77.62,
      },
    });

    await prisma.order.create({
      data: {
        id: testOrderId,
        orderNumber: testOrderNumber,
        customerId: testCustomerId,
        addressId: testAddressId,
        status: 'AGENT_ON_WAY',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        finalAmount: 91.0,
      },
    });

    await prisma.payment.create({
      data: {
        id: testPaymentId,
        orderId: testOrderId,
        direction: 'CUSTOMER_PAYS',
        amount: 91.0,
        status: 'CAPTURED',
        paymentId: `rzp_pg_test_${testId}`,
        gateway: 'RAZORPAY',
      },
    });

    console.log(`[PG Test] Seeded paid order #${testOrderNumber} in PostgreSQL.`);

    // 3. Invoke cancelOrder via the actual Next.js route handler
    // This hits the missing RefundRequest table inside the primary transaction,
    // triggers P2021, rolls back the transaction, and seamlessly executes the fallback transaction!
    const token = signToken({
      userId: testUserId,
      customerId: testCustomerId,
      phone: testUserPhone,
      role: 'CUSTOMER',
    });

    const cancelReq = new NextRequest(`http://localhost/api/orders/${testOrderId}/cancel`, {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancellationReason: 'Integration test reproducing missing RefundRequest table in PostgreSQL',
      }),
    });

    console.log('[PG Test] Invoking cancellation endpoint against live PostgreSQL (Missing RefundRequest table)...');
    const response = await cancelOrder(cancelReq, { params: Promise.resolve({ id: testOrderId }) });
    const responseData = await response.json();

    console.log(`[PG Test] Response status: ${response.status}`, responseData);
    assert.equal(response.status, 200, 'Cancellation must return HTTP 200 even with missing RefundRequest table');
    assert.equal(responseData.success, true);
    assert.equal(responseData.refundReviewRequired, true);

    // 4. Verify in PostgreSQL that the fallback transaction committed all records consistently
    const updatedOrder = await prisma.order.findUnique({
      where: { id: testOrderId },
    });
    assert.equal(updatedOrder?.status, 'CANCELLED', 'Order must be CANCELLED in PostgreSQL');
    assert.equal(updatedOrder?.paymentStatus, 'REFUND_PENDING', 'Order paymentStatus must be REFUND_PENDING in PostgreSQL');

    const updatedPayment = await prisma.payment.findUnique({
      where: { id: testPaymentId },
    });
    assert.equal(updatedPayment?.status, 'REFUND_PENDING', 'Payment status must be REFUND_PENDING in PostgreSQL');

    const attempt = await prisma.refundAttempt.findFirst({
      where: { orderId: testOrderId },
    });
    assert(attempt, 'RefundAttempt must be committed in PostgreSQL');
    assert.equal(attempt.status, 'RECONCILIATION_REQUIRED');

    const historyRecord = await prisma.orderStatusHistory.findFirst({
      where: { orderId: testOrderId, newStatus: 'CANCELLED' },
    });
    assert(historyRecord, 'OrderStatusHistory must be committed in PostgreSQL');

    const auditRecord = await prisma.auditLog.findFirst({
      where: { action: 'ORDER_CANCELLED', userId: testUserId },
    });
    assert(auditRecord, 'AuditLog must be committed in PostgreSQL');
    console.log('[PG Test] PASSED Part 1: Live PostgreSQL fallback committed successfully without 25P02 aborted-transaction errors.');

    // 5. Test Step 2: Now apply the migration to create the RefundRequest table and test clean primary path
    console.log('[PG Test] Applying migration SQL to create RefundRequest table in PostgreSQL...');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "RefundRequest" (
          "id" TEXT NOT NULL,
          "orderId" TEXT NOT NULL,
          "paymentId" TEXT NOT NULL,
          "requestedByUserId" TEXT NOT NULL,
          "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "status" TEXT NOT NULL DEFAULT 'PENDING_ADMIN_REVIEW',
          "amount" DOUBLE PRECISION NOT NULL,
          "reviewedByUserId" TEXT,
          "reviewedAt" TIMESTAMP(3),
          "reviewReason" TEXT,
          "razorpayRefundId" TEXT,
          "failureReason" TEXT,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
      );
    `);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_orderId_key" ON "RefundRequest"("orderId");`);
    await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "RefundRequest_paymentId_key" ON "RefundRequest"("paymentId");`);

    // Seed a second paid order
    const order2Id = `pg-order-migrated-${testId}`;
    const order2Number = `JIO-PG2-${testId}`;
    const payment2Id = `pg-pay2-${testId}`;

    await prisma.order.create({
      data: {
        id: order2Id,
        orderNumber: order2Number,
        customerId: testCustomerId,
        addressId: testAddressId,
        status: 'AGENT_ACCEPTED',
        paymentStatus: 'CAPTURED',
        financialDirection: 'CUSTOMER_PAYS',
        finalAmount: 150.0,
      },
    });

    await prisma.payment.create({
      data: {
        id: payment2Id,
        orderId: order2Id,
        direction: 'CUSTOMER_PAYS',
        amount: 150.0,
        status: 'CAPTURED',
        paymentId: `rzp_pg_test2_${testId}`,
        gateway: 'RAZORPAY',
      },
    });

    const cancelReq2 = new NextRequest(`http://localhost/api/orders/${order2Id}/cancel`, {
      method: 'POST',
      headers: {
        Cookie: `jio_token=${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        cancellationReason: 'Cancellation test with RefundRequest table migrated',
      }),
    });

    console.log('[PG Test] Invoking cancellation endpoint against live PostgreSQL (With RefundRequest table migrated)...');
    const response2 = await cancelOrder(cancelReq2, { params: Promise.resolve({ id: order2Id }) });
    const responseData2 = await response2.json();
    assert.equal(response2.status, 200);
    assert.equal(responseData2.success, true);

    // Verify RefundRequest was created in PostgreSQL on the primary transaction!
    const refundRequestRows = await prisma.$queryRaw<Array<{ id: string; status: string; amount: number }>>`
      SELECT id, status, amount FROM "RefundRequest" WHERE "orderId" = ${order2Id};
    `;
    assert.equal(refundRequestRows.length, 1, 'RefundRequest row must be created in PostgreSQL when table exists');
    assert.equal(refundRequestRows[0].status, 'PENDING_ADMIN_REVIEW');
    assert.equal(refundRequestRows[0].amount, 150.0);
    console.log('[PG Test] PASSED Part 2: Primary cancellation transaction with RefundRequest table committed successfully in PostgreSQL.');

  } finally {
    // Cleanup fixtures and drop temporary test table so parthiv_db stays clean
    try {
      await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "RefundRequest" CASCADE;`);
      await prisma.$executeRawUnsafe(`DELETE FROM "RefundAttemptEvent" WHERE "refundAttemptId" IN (SELECT id FROM "RefundAttempt" WHERE "orderId" IN ('${testOrderId}', 'pg-order-migrated-${testId}'));`);
      await prisma.$executeRawUnsafe(`DELETE FROM "RefundAttempt" WHERE "orderId" IN ('${testOrderId}', 'pg-order-migrated-${testId}');`);
      await prisma.payment.deleteMany({ where: { orderId: { in: [testOrderId, `pg-order-migrated-${testId}`] } } });
      await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: [testOrderId, `pg-order-migrated-${testId}`] } } });
      await prisma.auditLog.deleteMany({ where: { userId: testUserId } });
      await prisma.order.deleteMany({ where: { id: { in: [testOrderId, `pg-order-migrated-${testId}`] } } });
      await prisma.address.deleteMany({ where: { id: testAddressId } });
      await prisma.customer.deleteMany({ where: { id: testCustomerId } });
      await prisma.user.deleteMany({ where: { id: testUserId } });
      console.log('[PG Test] Cleaned up all test fixtures from PostgreSQL.');
    } catch (cleanupErr) {
      console.warn('[PG Test] Fixture cleanup notice:', cleanupErr);
    }
    await prisma.$disconnect();
  }
}

run().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
