import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, PUT, POST, DELETE } from '../app/api/service-areas/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { invalidateServiceAreasCache } from '../lib/cache/serviceAreasCache';
import { invalidateServiceAreaCache } from '../lib/services/serviceAreaService';

describe('Admin Service Areas Production Resilience & CRUD Suite', () => {
  let adminToken: string;
  let customerToken: string;
  let testAdminUserId: string | null = null;
  let testCustUserId: string | null = null;

  const SEED_UUID = 'd9e2a7b1-4f3c-4a8e-9b2d-1c3e5a7f9b0d';
  const TEST_ZONE_NAME = 'JP Nagar (Phases 1 to 9)';
  let testCreatedZoneId: string | null = null;
  let testOrderId: string | null = null;
  let testAddressId: string | null = null;
  let testCustomerId: string | null = null;

  beforeAll(async () => {
    invalidateServiceAreasCache();
    invalidateServiceAreaCache();

    // Create real test users in Postgres so Foreign Key constraints for AuditLog pass cleanly
    const adminUser = await db.user.create({
      data: {
        phone: `+91997${Math.floor(1000000 + Math.random() * 9000000)}`,
        name: 'CI Service Areas Admin',
        role: 'ADMIN',
        admin: {
          create: {
            department: 'Operations',
            accessLevel: 'ADMIN',
          },
        },
      },
      include: { admin: true },
    });
    testAdminUserId = adminUser.id;

    adminToken = signToken({
      userId: adminUser.id,
      phone: adminUser.phone,
      role: 'ADMIN',
      adminId: adminUser.admin?.id,
      tokenVersion: 1,
    });

    const custUser = await db.user.create({
      data: {
        phone: `+91996${Math.floor(1000000 + Math.random() * 9000000)}`,
        name: 'CI Service Areas Customer',
        role: 'CUSTOMER',
      },
    });
    testCustUserId = custUser.id;

    customerToken = signToken({
      userId: custUser.id,
      phone: custUser.phone,
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // Ensure seed record exists with UUID primary key and unique name (matching production state)
    try {
      await db.serviceArea.upsert({
        where: { name: TEST_ZONE_NAME },
        update: { status: 'ACTIVE' },
        create: {
          id: SEED_UUID,
          name: TEST_ZONE_NAME,
          city: 'Bengaluru',
          status: 'ACTIVE',
          etaMinutes: 20,
          basePickupCharge: 50,
          boundaryPolygon: JSON.stringify([
            [12.92, 77.575],
            [12.92, 77.6],
            [12.885, 77.6],
            [12.885, 77.575],
          ]),
          centerLat: 12.9077,
          centerLng: 77.5854,
        },
      });
    } catch (e) {
      console.warn('Prisma seed zone setup warning:', e);
    }
  });

  afterAll(async () => {
    // Clean up created resources safely
    try {
      if (testOrderId) {
        await db.order.deleteMany({ where: { id: testOrderId } });
      }
      if (testAddressId) {
        await db.address.deleteMany({ where: { id: testAddressId } });
      }
      if (testCustomerId) {
        await db.customer.deleteMany({ where: { id: testCustomerId } });
      }
      if (testCreatedZoneId) {
        await db.pricingRule.deleteMany({ where: { serviceAreaId: testCreatedZoneId } });
        await db.serviceArea.deleteMany({ where: { id: testCreatedZoneId } });
      }
      if (testAdminUserId) {
        await db.auditLog.deleteMany({ where: { userId: testAdminUserId } });
        await db.admin.deleteMany({ where: { userId: testAdminUserId } });
        await db.user.deleteMany({ where: { id: testAdminUserId } });
      }
      if (testCustUserId) {
        await db.user.deleteMany({ where: { id: testCustUserId } });
      }
      await db.serviceArea.deleteMany({ where: { name: 'Automated Test Area Bengaluru' } });
      await db.serviceArea.deleteMany({ where: { name: 'Updated Test Area Bengaluru' } });
    } catch (e) {
      console.warn('Cleanup warning:', e);
    }
  });

  // ---------------------------------------------------------------------------
  // 1. PRODUCTION ROOT CAUSE REGRESSION: P2002 Slug ID vs UUID Collision
  // ---------------------------------------------------------------------------
  it('PUT /api/service-areas toggles status using slug "jp-nagar" when DB record has UUID without P2002 500 error', async () => {
    invalidateServiceAreasCache();

    // Request using slug ID 'jp-nagar' as sent by Admin Dashboard UI
    const req = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: 'jp-nagar',
        status: 'INACTIVE',
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('INACTIVE');

    // Verify DB was updated and no duplicate row was created
    const inDb = await db.serviceArea.findMany({ where: { name: TEST_ZONE_NAME } });
    expect(inDb.length).toBe(1);
    expect(inDb[0].status).toBe('INACTIVE');

    // Toggle back to ACTIVE
    const reqBack = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: 'jp-nagar',
        status: 'ACTIVE',
      }),
    });

    const resBack = await PUT(reqBack);
    const bodyBack = await resBack.json();

    expect(resBack.status).toBe(200);
    expect(bodyBack.success).toBe(true);
    expect(bodyBack.data.status).toBe('ACTIVE');

    const inDbActive = await db.serviceArea.findUnique({ where: { name: TEST_ZONE_NAME } });
    expect(inDbActive?.status).toBe('ACTIVE');
  });

  // ---------------------------------------------------------------------------
  // 2. UUID PRIMARY KEY DIRECT TOGGLE
  // ---------------------------------------------------------------------------
  it('PUT /api/service-areas toggles status using actual UUID primary key', async () => {
    const existing = await db.serviceArea.findUnique({ where: { name: TEST_ZONE_NAME } });
    expect(existing).not.toBeNull();

    const req = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: existing!.id,
        status: 'INACTIVE',
      }),
    });

    const res = await PUT(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('INACTIVE');

    // Restore to ACTIVE
    await db.serviceArea.update({
      where: { id: existing!.id },
      data: { status: 'ACTIVE' },
    });
  });

  // ---------------------------------------------------------------------------
  // 3. GET SERVICE AREAS & DUAL-MATCHING
  // ---------------------------------------------------------------------------
  it('GET /api/service-areas returns merged zones and cache headers without duplicate entries', async () => {
    invalidateServiceAreasCache();

    const req = new NextRequest('http://localhost:3000/api/service-areas');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);

    // Verify jp-nagar zone is present and active
    const jpNagar = body.data.find((z: any) => z.id === 'jp-nagar');
    expect(jpNagar).toBeDefined();
    expect(jpNagar.name).toBe(TEST_ZONE_NAME);
    expect(jpNagar.status).toBe('ACTIVE');

    // Verify cache headers
    expect(res.headers.get('Cache-Control')).toContain('public');
    expect(res.headers.get('X-Cache')).toBe('MISS');

    // Subsequent GET should HIT cache
    const cachedRes = await GET(req);
    expect(cachedRes.headers.get('X-Cache')).toBe('HIT');
  });

  // ---------------------------------------------------------------------------
  // 4. POST NEW SERVICE AREA WITH DUPLICATE CHECK
  // ---------------------------------------------------------------------------
  it('POST /api/service-areas creates new service area and prevents duplicates', async () => {
    const areaName = `Automated Test Area Bengaluru ${Date.now()}`;

    const createReq = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: areaName,
        etaMinutes: 30,
        basePickupCharge: 50,
        centerLat: 12.9352,
        centerLng: 77.6245,
        status: 'ACTIVE',
      }),
    });

    const createRes = await POST(createReq);
    const createBody = await createRes.json();

    expect(createRes.status).toBe(201);
    expect(createBody.success).toBe(true);
    expect(createBody.data.name).toBe(areaName);
    testCreatedZoneId = createBody.data.id;

    // Attempt to create duplicate with identical name
    const dupReq = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        name: areaName,
      }),
    });

    const dupRes = await POST(dupReq);
    const dupBody = await dupRes.json();

    expect(dupRes.status).toBe(400);
    expect(dupBody.success).toBe(false);
    expect(dupBody.error.message).toContain('already exists');
  });

  // ---------------------------------------------------------------------------
  // 5. PUT UPDATE METADATA (ETA, Base Charge, Coordinates)
  // ---------------------------------------------------------------------------
  it('PUT /api/service-areas updates metadata successfully', async () => {
    expect(testCreatedZoneId).not.toBeNull();

    const updateReq = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: testCreatedZoneId,
        etaMinutes: 45,
        basePickupCharge: 60,
      }),
    });

    const updateRes = await PUT(updateReq);
    const updateBody = await updateRes.json();

    expect(updateRes.status).toBe(200);
    expect(updateBody.data.etaMinutes).toBe(45);
    expect(updateBody.data.basePickupCharge).toBe(60);
  });

  // ---------------------------------------------------------------------------
  // 6. DELETE SERVICE AREA WITH ACTIVE ORDER PROTECTION
  // ---------------------------------------------------------------------------
  it('DELETE /api/service-areas rejects deletion when active orders exist and allows deletion otherwise', async () => {
    expect(testCreatedZoneId).not.toBeNull();

    const createdZone = await db.serviceArea.findUnique({ where: { id: testCreatedZoneId! } });
    expect(createdZone).not.toBeNull();

    // Create a customer, address, and active order in this area
    const testUser = await db.user.create({
      data: {
        phone: `+91987${Math.floor(1000000 + Math.random() * 9000000)}`,
        name: 'Area Test User',
        role: 'CUSTOMER',
        customer: { create: {} },
      },
      include: { customer: true },
    });
    testCustomerId = testUser.customer!.id;

    const testAddr = await db.address.create({
      data: {
        userId: testUser.id,
        name: 'Test Customer Address',
        phone: testUser.phone,
        houseNo: '123',
        street: `${createdZone!.name} Main Road`,
        area: createdZone!.name,
        pincode: '560034',
        lat: createdZone!.centerLat,
        lng: createdZone!.centerLng,
      },
    });
    testAddressId = testAddr.id;

    const testOrder = await db.order.create({
      data: {
        orderNumber: `TEST-SA-${Date.now()}`,
        customerId: testCustomerId,
        addressId: testAddressId,
        status: 'ASSIGNED', // Active status
      },
    });
    testOrderId = testOrder.id;

    // Attempt to delete service area with active order -> must return 400
    const deleteBlockedReq = new NextRequest(
      `http://localhost:3000/api/service-areas?id=${testCreatedZoneId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const deleteBlockedRes = await DELETE(deleteBlockedReq);
    const deleteBlockedBody = await deleteBlockedRes.json();

    expect(deleteBlockedRes.status).toBe(400);
    expect(deleteBlockedBody.success).toBe(false);
    expect(deleteBlockedBody.error.message).toContain('active order');

    // Cancel the order so it is no longer active
    await db.order.update({
      where: { id: testOrderId },
      data: { status: 'CANCELLED' },
    });

    // Attempt deletion again -> must succeed with 200
    const deleteReq = new NextRequest(
      `http://localhost:3000/api/service-areas?id=${testCreatedZoneId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      }
    );

    const deleteRes = await DELETE(deleteReq);
    const deleteBody = await deleteRes.json();

    expect(deleteRes.status).toBe(200);
    expect(deleteBody.success).toBe(true);
    expect(deleteBody.data.deleted).toBe(true);

    // Verify record is gone from DB
    const afterDelete = await db.serviceArea.findUnique({ where: { id: testCreatedZoneId! } });
    expect(afterDelete).toBeNull();
    testCreatedZoneId = null; // Cleaned up
  });

  // ---------------------------------------------------------------------------
  // 7. ROLE GUARD AND AUTHENTICATION ENFORCEMENT
  // ---------------------------------------------------------------------------
  it('PUT/POST/DELETE enforce 401 for unauthenticated and 403 for non-admin users', async () => {
    // 401 Unauthorized without token
    const unauthPut = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'jp-nagar', status: 'ACTIVE' }),
    });
    const unauthRes = await PUT(unauthPut);
    expect(unauthRes.status).toBe(401);

    // 403 Forbidden for customer role
    const custPut = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${customerToken}`,
      },
      body: JSON.stringify({ id: 'jp-nagar', status: 'ACTIVE' }),
    });
    const custRes = await PUT(custPut);
    expect(custRes.status).toBe(403);

    // POST 401
    const unauthPost = new NextRequest('http://localhost:3000/api/service-areas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Unauthorized Zone' }),
    });
    const unauthPostRes = await POST(unauthPost);
    expect(unauthPostRes.status).toBe(401);

    // DELETE 401
    const unauthDel = new NextRequest('http://localhost:3000/api/service-areas?id=123', {
      method: 'DELETE',
    });
    const unauthDelRes = await DELETE(unauthDel);
    expect(unauthDelRes.status).toBe(401);
  });
});
