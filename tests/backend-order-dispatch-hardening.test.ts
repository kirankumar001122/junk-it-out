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

process.env.JWT_SECRET = 'test-backend-order-dispatch-hardening-secret-2026';

async function runHardeningTests() {
  const { NextRequest } = await import('next/server');
  const { signToken } = await import('../lib/auth/jwt');
  const { getAuthUser, requireAdminUser, isAdminRole } = await import('../lib/auth/middleware');
  const { POST: assignAgent } = await import('../app/api/orders/[id]/assign/route');
  const { PATCH: updateAgentStatus } = await import('../app/api/agent/status/route');
  const { POST: weighOrder } = await import('../app/api/orders/[id]/weigh/route');
  const { POST: completeOrder } = await import('../app/api/orders/[id]/complete/route');
  const { validateCreateOrderInput } = await import('../lib/validations/schemas');
  const { checkGeofenceServiceability, invalidateServiceAreaCache } = await import('../lib/services/serviceAreaService');
  const { POST: createAddress } = await import('../app/api/customer/addresses/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  console.log('--- RUNNING BACKEND ORDER & DISPATCH HARDENING TESTS ---');

  // =========================================================================
  // TEST 1: Dual Login Session & "Admin Required" Prevention
  // =========================================================================
  console.log('Test 1: Prevents "Admin access required" when browser holds dual admin + agent cookies...');
  {
    const adminToken = signToken({
      userId: 'user-sk',
      phone: '+917479895482',
      name: 'S.K',
      role: 'SUPER_ADMIN',
      adminId: 'admin-sk-1',
      agentId: 'agent-sk-1',
    });

    const agentToken = signToken({
      userId: 'user-sk',
      phone: '+917479895482',
      name: 'S.K',
      role: 'AGENT',
      adminId: 'admin-sk-1',
      agentId: 'agent-sk-1',
      tokenVersion: 1,
    });

    // Case A: Request with agent token as jio_token, but has adminId in payload
    assert.equal(isAdminRole({ role: 'AGENT', adminId: 'admin-sk-1' } as any), true);

    // Case B: Request to /api/orders/[id]/assign with jio_token=agentToken AND jio_admin_token=adminToken
    database.order.findUnique = async () => ({
      id: 'order-assign-1',
      orderNumber: 'JIO-ASSIGN-01',
      status: 'BOOKING_RECEIVED',
      agentId: null,
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      customer: { user: { name: 'Customer Test', phone: '+919999999999' } },
      agent: null,
    });

    database.agent.findUnique = async () => ({
      id: 'agent-sk-1',
      status: 'AVAILABLE',
      serviceAreas: 'all',
      tokenVersion: 1,
      user: { name: 'S.K', phone: '+917479895482' },
    });

    database.$transaction = async (cb: any) => {
      const tx = {
        $queryRaw: async () => [{ id: 'order-assign-1' }],
        order: {
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({
            id: 'order-assign-1',
            orderNumber: 'JIO-ASSIGN-01',
            status: 'BOOKING_RECEIVED',
            agentId: null,
            financialDirection: 'CUSTOMER_PAYS',
            paymentStatus: 'CAPTURED',
            customer: { user: { name: 'Customer Test', phone: '+919999999999' } },
            agent: null,
          }),
          update: async () => ({
            id: 'order-assign-1',
            status: 'AGENT_ASSIGNED',
            agentId: 'agent-sk-1',
          }),
        },
        agent: {
          update: async () => ({ id: 'agent-sk-1', status: 'ASSIGNED' }),
        },
        notification: {
          create: async () => ({ id: 'notif-1' }),
          createMany: async () => ({ count: 1 }),
        },
        orderStatusHistory: {
          create: async () => ({ id: 'h-1' }),
        },
        auditLog: {
          create: async () => ({ id: 'audit-1' }),
        },
      };
      return cb(tx);
    };

    const req = new NextRequest('http://localhost:3000/api/orders/order-assign-1/assign', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: `jio_token=${agentToken}; jio_admin_token=${adminToken}`,
        Referer: 'http://localhost:3000/admin/orders',
      },
      body: JSON.stringify({ agentId: 'agent-sk-1' }),
    });

    const res = await assignAgent(req, { params: Promise.resolve({ id: 'order-assign-1' }) });
    assert.equal(res.status, 200, 'Dual-role admin/agent user must successfully assign orders without 403');
    console.log('✓ Dual-login admin/agent assign passed cleanly!');
  }

  // =========================================================================
  // TEST 2: Agent Online/Offline Status Toggling
  // =========================================================================
  console.log('Test 2: Agent status toggle allows resuming ASSIGNED state and entering AVAILABLE...');
  {
    const agentToken = signToken({
      userId: 'user-sk',
      phone: '+917479895482',
      name: 'S.K',
      role: 'AGENT',
      agentId: 'agent-sk-1',
      tokenVersion: 1,
    });

    // Subtest 2a: Toggle to ASSIGNED when active order exists
    database.$transaction = async (cb: any) => {
      const tx = {
        order: {
          findFirst: async () => ({ id: 'active-ord-1' }),
        },
        agent: {
          update: async ({ data }: any) => ({
            id: 'agent-sk-1',
            status: data.status,
            serviceAreas: 'JP Nagar, Jayanagar',
            user: { name: 'S.K' },
          }),
        },
      };
      return cb(tx);
    };

    const reqAssigned = new NextRequest('http://localhost:3000/api/agent/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({ status: 'ASSIGNED' }),
    });

    const resAssigned = await updateAgentStatus(reqAssigned);
    assert.equal(resAssigned.status, 200);
    const bodyAssigned = await resAssigned.json();
    assert.equal(bodyAssigned.data.status, 'ASSIGNED');

    // Subtest 2b: Toggle to AVAILABLE when no in-progress orders exist
    database.$transaction = async (cb: any) => {
      const tx = {
        order: {
          findFirst: async () => null,
        },
        agent: {
          update: async ({ data }: any) => ({
            id: 'agent-sk-1',
            status: data.status,
            serviceAreas: 'JP Nagar, Jayanagar',
            user: { name: 'S.K' },
          }),
        },
      };
      return cb(tx);
    };

    const reqAvailable = new NextRequest('http://localhost:3000/api/agent/status', {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({ status: 'AVAILABLE' }),
    });

    const resAvailable = await updateAgentStatus(reqAvailable);
    assert.equal(resAvailable.status, 200);
    const bodyAvailable = await resAvailable.json();
    assert.equal(bodyAvailable.data.status, 'AVAILABLE');

    console.log('✓ Agent status toggle passed cleanly!');
  }

  // =========================================================================
  // TEST 3: Incomplete Weighing Validation
  // =========================================================================
  console.log('Test 3: Rejects incomplete weighing submissions when items are missing...');
  {
    const agentToken = signToken({
      userId: 'user-sk',
      phone: '+917479895482',
      name: 'S.K',
      role: 'AGENT',
      agentId: 'agent-sk-1',
      tokenVersion: 1,
    });

    database.order.findUnique = async () => ({
      id: 'order-weigh-2items',
      agentId: 'agent-sk-1',
      status: 'AGENT_ARRIVED',
      weightRecords: [],
      items: [
        { id: 'item-1', categoryId: 'cat-1', ratePerKg: 10, category: { type: 'RECYCLABLE' } },
        { id: 'item-2', categoryId: 'cat-2', ratePerKg: 15, category: { type: 'RECYCLABLE' } },
      ],
      customer: { user: { name: 'Cust', phone: '+919999999999' } },
      agent: { user: { name: 'S.K' } },
    });

    // Submitting weight for only 1 of the 2 items
    const reqIncomplete = new NextRequest('http://localhost:3000/api/orders/order-weigh-2items/weigh', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({
        actualWeights: [{ itemId: 'item-1', actualWeight: 12.5 }],
      }),
    });

    const resIncomplete = await weighOrder(reqIncomplete, { params: Promise.resolve({ id: 'order-weigh-2items' }) });
    assert.equal(resIncomplete.status, 400);
    const bodyIncomplete = await resIncomplete.json();
    assert.equal(bodyIncomplete.error?.code, 'INVALID_WEIGH_DATA');
    assert.match(bodyIncomplete.error?.message, /All order items must have actual weights recorded/);

    console.log('✓ Incomplete weighing rejection passed cleanly!');
  }

  // =========================================================================
  // TEST 4: Prevent Completion When Item Weights are Missing
  // =========================================================================
  console.log('Test 4: Prevents order completion when required item weights are missing...');
  {
    const agentToken = signToken({
      userId: 'user-sk',
      phone: '+917479895482',
      name: 'S.K',
      role: 'AGENT',
      agentId: 'agent-sk-1',
      tokenVersion: 1,
    });

    database.order.findUnique = async () => ({
      id: 'order-missing-weights',
      agentId: 'agent-sk-1',
      status: 'WEIGHING',
      weightRecords: [{ id: 'w-1', createdAt: new Date() }],
      invoices: [],
      // Item 2 has no actualWeight recorded!
      items: [
        { id: 'item-1', categoryId: 'cat-1', actualWeight: 10, ratePerKg: 15 },
        { id: 'item-2', categoryId: 'cat-2', actualWeight: null, ratePerKg: 20 },
      ],
      customer: { user: { name: 'Customer Test' } },
      agent: { user: { name: 'S.K' } },
    });

    const reqComplete = new NextRequest('http://localhost:3000/api/orders/order-missing-weights/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${agentToken}`,
      },
      body: JSON.stringify({}),
    });

    const resComplete = await completeOrder(reqComplete, { params: Promise.resolve({ id: 'order-missing-weights' }) });
    assert.equal(resComplete.status, 400);
    const bodyComplete = await resComplete.json();
    assert.equal(bodyComplete.error?.code, 'WEIGHING_REQUIRED');
    assert.match(bodyComplete.error?.message, /All order items must have valid recorded weights/);

    console.log('✓ Missing weight completion prevention passed cleanly!');
  }

  // =========================================================================
  // TEST 5: Scheduled Pickup Slot Validation
  // =========================================================================
  console.log('Test 5: Validates scheduled pickup dates and rejects past dates...');
  {
    const validFuture = validateCreateOrderInput({
      phone: '+919999999999',
      name: 'Customer Test',
      address: {
        houseNo: '10',
        street: 'Main Road',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9134,
        lng: 77.5944,
      },
      items: [{ categoryId: 'cat-1', estimatedWeight: 10 }],
      pickupType: 'SCHEDULED',
      scheduledSlot: 'Tomorrow (2026-10-31), 10:00 AM - 12:00 PM',
    });
    assert.equal(validFuture.valid, true);

    const invalidPast = validateCreateOrderInput({
      phone: '+919999999999',
      name: 'Customer Test',
      address: {
        houseNo: '10',
        street: 'Main Road',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9134,
        lng: 77.5944,
      },
      items: [{ categoryId: 'cat-1', estimatedWeight: 10 }],
      pickupType: 'SCHEDULED',
      scheduledSlot: 'Yesterday (2026-10-01), 10:00 AM - 12:00 PM',
    });
    assert.equal(invalidPast.valid, false);
    assert.match(invalidPast.error || '', /cannot be in the past/);

    console.log('✓ Scheduled pickup date validation passed cleanly!');
  }

  // =========================================================================
  // TEST 6: Temporary Service Area Block & Geofence
  // =========================================================================
  console.log('Test 6: Enforces temporary service area block when an area is INACTIVE in DB...');
  {
    invalidateServiceAreaCache();
    database.serviceArea = {
      findMany: async () => [
        {
          id: 'area-inactive-1',
          name: 'Electronic City (Phase 1 & 2)',
          etaMinutes: 30,
          basePickupCharge: 49,
          status: 'INACTIVE',
          boundaryPolygon: '[[12.83, 77.65], [12.86, 77.65], [12.86, 77.69], [12.83, 77.69]]',
        },
      ],
    };

    const resInactive = await checkGeofenceServiceability(
      12.845,
      77.665,
      'Electronic City (Phase 1 & 2)'
    );
    assert.equal(resInactive.serviceable, false);
    assert.match(resInactive.message, /currently disabled\/inactive/);

    console.log('✓ Temporary service area block passed cleanly!');
  }

  // =========================================================================
  // TEST 7: Customer Address Validation (No Fallback Coordinates)
  // =========================================================================
  console.log('Test 7: Rejects addresses with missing/invalid coordinates without hardcoded fallbacks...');
  {
    const customerToken = signToken({
      userId: 'user-cust-1',
      phone: '+919876543210',
      name: 'Customer Test',
      role: 'CUSTOMER',
      customerId: 'cust-1',
    });

    database.user.findUnique = async () => ({
      id: 'user-cust-1',
      phone: '+919876543210',
      name: 'Customer Test',
    });

    const reqNoCoords = new NextRequest('http://localhost:3000/api/customer/addresses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({
        houseNo: '42',
        street: '100ft Road',
        area: 'Koramangala',
        pincode: '560034',
        lat: null, // missing coords!
        lng: undefined,
      }),
    });

    const resNoCoords = await createAddress(reqNoCoords);
    assert.equal(resNoCoords.status, 400);
    const bodyNoCoords = await resNoCoords.json();
    assert.match(bodyNoCoords.message, /Valid GPS latitude and longitude coordinates are required/);

    console.log('✓ Customer address coordinate validation passed cleanly!');
  }

  console.log('===============================================================');
  console.log('✓ ALL BACKEND ORDER & DISPATCH HARDENING TESTS PASSED 100%!');
  console.log('===============================================================');
}

runHardeningTests()
  .catch((e) => {
    console.error('Hardening tests failed:', e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
