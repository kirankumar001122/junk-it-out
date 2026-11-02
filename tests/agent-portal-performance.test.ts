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

(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
process.env.JWT_SECRET = 'performance-benchmark-secret-2026';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_PHONE = '9000000000';
process.env.FAST2SMS_API_KEY = '';
process.env.FAST2SMS_WHATSAPP_API_KEY = '';

interface MetricStats {
  count: number;
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  meanMs: number;
}

function calculateStats(samples: number[]): MetricStats {
  const sorted = [...samples].sort((a, b) => a - b);
  const count = sorted.length;
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  const p50 = sorted[Math.floor(count * 0.5)];
  const p95 = sorted[Math.floor(count * 0.95)];
  return {
    count,
    minMs: Number(sorted[0].toFixed(2)),
    p50Ms: Number(p50.toFixed(2)),
    p95Ms: Number(p95.toFixed(2)),
    maxMs: Number(sorted[count - 1].toFixed(2)),
    meanMs: Number((sum / count).toFixed(2)),
  };
}

async function runBenchmark() {
  const { NextRequest } = await import('next/server');
  const { POST: agentLogin } = await import('../app/api/auth/agent-login/route');
  const { POST: logout } = await import('../app/api/auth/logout/route');
  const { GET: getOrder } = await import('../app/api/orders/[id]/route');
  const { POST: acceptOrder } = await import('../app/api/orders/[id]/accept/route');
  const { POST: startOrder } = await import('../app/api/orders/[id]/start/route');
  const { POST: arriveOrder } = await import('../app/api/orders/[id]/arrive/route');
  const { POST: weighOrder } = await import('../app/api/orders/[id]/weigh/route');
  const { POST: completeOrder } = await import('../app/api/orders/[id]/complete/route');
  const { POST: updateLocation } = await import('../app/api/agent/location/route');
  const { PATCH: updateStatus } = await import('../app/api/agent/status/route');
  const { db } = await import('../lib/db');
  const { signToken } = await import('../lib/auth/jwt');

  const database = db as any;

  const agentUser = {
    id: 'perf-user-1',
    phone: '+919000000000',
    name: 'Performance Agent',
    role: 'AGENT',
  };

  const agentRecord = {
    id: 'perf-agent-1',
    userId: agentUser.id,
    vehicleType: 'EV Loader',
    vehicleNumber: 'KA-01-EV-1234',
    status: 'AVAILABLE',
    serviceAreas: 'Koramangala, Indiranagar',
    tokenVersion: 1,
    user: agentUser,
  };

  const agentToken = signToken({
    userId: agentUser.id,
    phone: agentUser.phone,
    name: agentUser.name,
    role: 'AGENT',
    agentId: agentRecord.id,
    tokenVersion: 1,
  });

  const baseOrder = {
    id: 'perf-order-1',
    orderNumber: 'JIO-PERF-001',
    customerId: 'perf-cust-1',
    agentId: null as string | null,
    status: 'BOOKING_RECEIVED',
    financialDirection: 'JUNKITOUT_PAYS',
    paymentStatus: 'PENDING',
    customer: {
      id: 'perf-cust-1',
      userId: 'perf-cust-user',
      user: { name: 'Customer Test', phone: '+919876543210' },
    },
    address: {
      name: 'Customer Test',
      houseNo: '42-A',
      street: '100ft Road',
      area: 'Koramangala',
      lat: 12.9352,
      lng: 77.6245,
      pickupInstructions: 'Ring doorbell',
    },
    items: [
      {
        id: 'perf-item-1',
        categoryId: 'cat-paper',
        estimatedWeight: 15,
        actualWeight: 0,
        category: { id: 'cat-paper', name: 'Paper / Cartons', pricePerKg: 12 },
      },
    ],
    weightRecords: [],
  };

  // Mock database calls with high-performance in-memory state
  database.user.findFirst = async () => ({ ...agentUser, agent: agentRecord });
  database.user.findUnique = async () => ({ id: agentUser.id, tokenVersion: 1 });
  database.user.update = async () => ({ id: agentUser.id, tokenVersion: 2 });
  database.agent.findUnique = async ({ where }: any) => {
    if (where.id === agentRecord.id) return agentRecord;
    return null;
  };
  database.agent.update = async ({ data }: any) => {
    Object.assign(agentRecord, data);
    return agentRecord;
  };
  database.order.findFirst = async ({ where }: any) => {
    if (where?.agentId) return null;
    return baseOrder;
  };
  database.order.findMany = async () => [];
  database.order.findUnique = async () => baseOrder;
  database.order.updateMany = async ({ data }: any) => {
    Object.assign(baseOrder, data);
    return { count: 1 };
  };
  database.orderStatusHistory.create = async ({ data }: any) => ({ id: 'hist-1', ...data });
  database.notification.createMany = async () => ({ count: 1 });
  database.notification.create = async ({ data }: any) => ({ id: 'notif-1', ...data });
  database.notification.findFirst = async () => null;
  database.auditLog.create = async () => ({ id: 'audit-1' });
  database.agentLocation.findMany = async () => [];
  database.agentLocation.create = async ({ data }: any) => ({ id: 'loc-1', ...data });
  database.weightRecord.create = async ({ data }: any) => ({ id: 'wt-1', ...data });
  database.orderItem.update = async ({ data }: any) => ({ ...baseOrder.items[0], ...data });
  database.invoice.create = async () => ({ id: 'inv-1', invoiceNumber: 'INV-PERF-1' });
  database.settlement.create = async () => ({ id: 'set-1' });
  database.serviceArea = {
    findFirst: async () => ({ id: 'area-1', name: 'Koramangala', status: 'ACTIVE' }),
    findMany: async () => [{ id: 'area-1', name: 'Koramangala', status: 'ACTIVE', boundaryPolygon: '[]' }],
  };
  database.$transaction = async (callback: any) => {
    const tx = {
      $queryRaw: async () => [],
      order: {
        findFirst: async ({ where }: any) => {
          if (where?.status?.in && where.status.in.includes(baseOrder.status)) {
            return baseOrder;
          }
          return null;
        },
        findUnique: async () => baseOrder,
        updateMany: async ({ data }: any) => {
          Object.assign(baseOrder, data);
          return { count: 1 };
        },
        update: async ({ data }: any) => {
          Object.assign(baseOrder, data);
          return baseOrder;
        },
      },
      agent: {
        findUnique: async () => agentRecord,
        update: async ({ data }: any) => {
          Object.assign(agentRecord, data);
          return agentRecord;
        },
      },
      agentLocation: {
        findFirst: async () => null,
        create: async ({ data }: any) => ({ id: 'tx-loc-1', ...data }),
      },
      orderStatusHistory: { create: async () => ({ id: 'tx-hist-1' }) },
      notification: { createMany: async () => ({ count: 1 }), create: async () => ({ id: 'tx-notif-1' }) },
      auditLog: { create: async () => ({ id: 'tx-audit-1' }) },
      weightRecord: { create: async ({ data }: any) => ({ id: 'tx-wt-1', ...data }) },
      orderItem: { update: async ({ data }: any) => ({ ...baseOrder.items[0], ...data }) },
      invoice: { create: async () => ({ id: 'tx-inv-1' }) },
      settlement: { create: async () => ({ id: 'tx-set-1' }) },
    };
    return callback(tx);
  };

  const ITERATIONS = 30;
  const results: Record<string, MetricStats> = {};

  // 1. Agent Login
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const req = new NextRequest('http://localhost/api/auth/agent-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '9000000000', code: '123456' }),
      });
      const t0 = performance.now();
      const res = await agentLogin(req);
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/auth/agent-login (OTP Auth)'] = calculateStats(times);
  }

  // 2. Open Pickup Read-Only Preview (unassigned order)
  {
    baseOrder.agentId = null;
    baseOrder.status = 'BOOKING_RECEIVED';
    agentRecord.status = 'AVAILABLE';
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const req = new NextRequest('http://localhost/api/orders/perf-order-1', {
        headers: { Cookie: `jio_token=${agentToken}` },
      });
      const t0 = performance.now();
      const res = await getOrder(req, { params: Promise.resolve({ id: 'perf-order-1' }) });
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['GET /api/orders/[id] (Unassigned Open Preview)'] = calculateStats(times);
  }

  // 3. Accept Pickup
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      baseOrder.agentId = null;
      baseOrder.status = 'BOOKING_RECEIVED';
      agentRecord.status = 'AVAILABLE';
      const req = new NextRequest('http://localhost/api/orders/perf-order-1/accept', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}`, 'Content-Type': 'application/json' },
      });
      const t0 = performance.now();
      const res = await acceptOrder(req, { params: Promise.resolve({ id: 'perf-order-1' }) });
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/orders/[id]/accept (Accept Assignment)'] = calculateStats(times);
  }

  // 4. Start Journey
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      baseOrder.agentId = agentRecord.id;
      baseOrder.status = 'AGENT_ACCEPTED';
      agentRecord.status = 'ASSIGNED';
      const req = new NextRequest('http://localhost/api/orders/perf-order-1/start', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}` },
      });
      const t0 = performance.now();
      const res = await startOrder(req, { params: Promise.resolve({ id: 'perf-order-1' }) });
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/orders/[id]/start (Start Journey)'] = calculateStats(times);
  }

  // 5. Location Heartbeat Update
  {
    baseOrder.agentId = agentRecord.id;
    baseOrder.status = 'AGENT_ON_WAY';
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const req = new NextRequest('http://localhost/api/agent/location', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: baseOrder.id,
          lat: 12.9352 + i * 0.0001,
          lng: 77.6245 + i * 0.0001,
        }),
      });
      const t0 = performance.now();
      const res = await updateLocation(req);
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/agent/location (Heartbeat Tracking)'] = calculateStats(times);
  }

  // 6. Mark Arrived
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      baseOrder.agentId = agentRecord.id;
      baseOrder.status = 'AGENT_ON_WAY';
      agentRecord.status = 'EN_ROUTE';
      const req = new NextRequest('http://localhost/api/orders/perf-order-1/arrive', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}` },
      });
      const t0 = performance.now();
      const res = await arriveOrder(req, { params: Promise.resolve({ id: 'perf-order-1' }) });
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/orders/[id]/arrive (Mark Arrived)'] = calculateStats(times);
  }

  // 7. Atomic Weighing & Complete
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      baseOrder.agentId = agentRecord.id;
      baseOrder.status = 'AGENT_ARRIVED';
      agentRecord.status = 'ARRIVED';
      const req = new NextRequest('http://localhost/api/orders/perf-order-1/complete', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actualWeights: [{ itemId: 'perf-item-1', categoryId: 'cat-paper', actualWeight: 14.5 }],
          scalePhotoUrl: null,
          notes: 'Verified on portable scale',
        }),
      });
      const t0 = performance.now();
      const res = await completeOrder(req, { params: Promise.resolve({ id: 'perf-order-1' }) });
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/orders/[id]/complete (Weigh & Settle)'] = calculateStats(times);
  }

  // 8. Agent Status Toggle (AVAILABLE <-> OFFLINE)
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const nextStatus = i % 2 === 0 ? 'OFFLINE' : 'AVAILABLE';
      const req = new NextRequest('http://localhost/api/agent/status', {
        method: 'PATCH',
        headers: { Cookie: `jio_token=${agentToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      });
      const t0 = performance.now();
      const res = await updateStatus(req);
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['PATCH /api/agent/status (Toggle Online/Offline)'] = calculateStats(times);
  }

  // 9. Logout
  {
    const times: number[] = [];
    for (let i = 0; i < ITERATIONS; i++) {
      const req = new NextRequest('http://localhost/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: `jio_token=${agentToken}` },
      });
      const t0 = performance.now();
      const res = await logout(req);
      const t1 = performance.now();
      assert.equal(res.status, 200);
      times.push(t1 - t0);
    }
    results['POST /api/auth/logout (Session Revocation)'] = calculateStats(times);
  }

  // Print Summary Table
  console.log('\n================ AGENT PORTAL IN-PROCESS HANDLER PERFORMANCE (MOCKED DB) ================');
  console.log('| Note: Measures internal JavaScript handler execution time using synthetic fixtures.   |');
  console.log('| No real HTTP network, database sockets, or external provider calls are included.       |');
  console.log('|----------------------------------------------------|---------|----------|----------|----------|----------|-----------|');
  console.log('| Route Handler / Operation                          | Samples | Min (ms) | P50 (ms) | P95 (ms) | Max (ms) | Mean (ms) |');
  console.log('|----------------------------------------------------|---------|----------|----------|----------|----------|-----------|');
  for (const [op, stats] of Object.entries(results)) {
    console.log(
      `| ${op.padEnd(50)} | ${String(stats.count).padStart(7)} | ${stats.minMs.toFixed(2).padStart(8)} | ${stats.p50Ms.toFixed(2).padStart(8)} | ${stats.p95Ms.toFixed(2).padStart(8)} | ${stats.maxMs.toFixed(2).padStart(8)} | ${stats.meanMs.toFixed(2).padStart(9)} |`
    );
  }
  console.log('=========================================================================================\n');

  // Assert Performance SLAs
  for (const [op, stats] of Object.entries(results)) {
    assert(stats.p50Ms < 50, `${op} P50 exceeds 50ms (was ${stats.p50Ms}ms)`);
    assert(stats.p95Ms < 100, `${op} P95 exceeds 100ms (was ${stats.p95Ms}ms)`);
  }
  console.log('All Agent Portal in-process handler performance targets met (P50 < 50ms, P95 < 100ms with mocked in-memory DB).');
}

void runBenchmark().catch((err) => {
  console.error('Performance benchmark failed:', err);
  process.exit(1);
});
