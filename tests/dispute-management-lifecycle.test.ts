import assert from 'node:assert/strict';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createComplaintRoute, GET as getComplaintsRoute } from '../app/api/complaints/route';
import { GET as getComplaintDetailRoute, POST as customerRespondRoute } from '../app/api/complaints/[id]/route';
import { PUT as adminUpdateComplaintRoute, GET as adminGetComplaintsRoute } from '../app/api/admin/complaints/route';
import { validateDisputeTransition } from '../lib/validations/disputeTransitions';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

describe('FEATURE 05: Dispute Management — Live Customer Status & Lifecycle', () => {
  let customerA: any;
  let customerB: any;
  let adminUser: any;
  let tokenA: string;
  let tokenB: string;
  let adminToken: string;
  let testOrder: any;
  let createdDisputeId: string;

  beforeAll(async () => {
    // 1. Create Customer A
    const phoneA = `+91992${Math.floor(1000000 + Math.random() * 9000000)}`;
    customerA = await db.user.create({
      data: {
        phone: phoneA,
        name: 'Dispute Customer A',
        email: `dispute_a_${Date.now()}@example.com`,
        role: 'CUSTOMER',
        tokenVersion: 1,
        customer: { create: { referralCode: `DISPA${Date.now().toString(36)}` } },
      },
      include: { customer: true },
    });
    tokenA = signToken({
      userId: customerA.id,
      phone: customerA.phone,
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // 2. Create Customer B (for authorization / access control checks)
    const phoneB = `+91993${Math.floor(1000000 + Math.random() * 9000000)}`;
    customerB = await db.user.create({
      data: {
        phone: phoneB,
        name: 'Dispute Customer B',
        email: `dispute_b_${Date.now()}@example.com`,
        role: 'CUSTOMER',
        tokenVersion: 1,
        customer: { create: { referralCode: `DISPB${Date.now().toString(36)}` } },
      },
      include: { customer: true },
    });
    tokenB = signToken({
      userId: customerB.id,
      phone: customerB.phone,
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // 3. Create Admin user
    const adminPhone = `+91994${Math.floor(1000000 + Math.random() * 9000000)}`;
    adminUser = await db.user.create({
      data: {
        phone: adminPhone,
        name: 'Dispute Operations Admin',
        email: `admin_disp_${Date.now()}@example.com`,
        role: 'ADMIN',
        tokenVersion: 1,
      },
    });
    adminToken = signToken({
      userId: adminUser.id,
      phone: adminUser.phone,
      role: 'ADMIN',
      tokenVersion: 1,
    });

    // 4. Create address & order for Customer A
    const address = await db.address.create({
      data: {
        userId: customerA.id,
        name: 'Home',
        phone: phoneA,
        houseNo: '77',
        street: '8th Main',
        area: 'BTM Layout',
        city: 'Bengaluru',
        pincode: '560068',
        lat: 12.9166,
        lng: 77.6101,
      },
    });

    testOrder = await db.order.create({
      data: {
        orderNumber: `ORD-DISP-${Date.now()}`,
        customerId: customerA.customer.id,
        addressId: address.id,
        status: 'COMPLETED',
        estimatedTotal: 300,
        finalAmount: 200,
        pickupCharge: 0,
      },
    });
  });

  afterAll(async () => {
    try {
      if (createdDisputeId) {
        await db.complaint.delete({ where: { id: createdDisputeId } }).catch(() => null);
      }
      if (testOrder?.id) await db.order.delete({ where: { id: testOrder.id } }).catch(() => null);
      if (customerA?.id) {
        await db.address.deleteMany({ where: { userId: customerA.id } }).catch(() => null);
        await db.customer.deleteMany({ where: { userId: customerA.id } }).catch(() => null);
        await db.user.delete({ where: { id: customerA.id } }).catch(() => null);
      }
      if (customerB?.id) {
        await db.customer.deleteMany({ where: { userId: customerB.id } }).catch(() => null);
        await db.user.delete({ where: { id: customerB.id } }).catch(() => null);
      }
      if (adminUser?.id) {
        await db.user.delete({ where: { id: adminUser.id } }).catch(() => null);
      }
    } catch {
      // Best effort cleanup
    }
  });

  // 1. STATE MACHINE TRANSITION VALIDATION HELPER
  it('validates dispute status transitions correctly according to business rules', () => {
    // Valid transitions
    assert.equal(validateDisputeTransition('OPEN', 'UNDER_REVIEW').valid, true);
    assert.equal(validateDisputeTransition('OPEN', 'REJECTED').valid, true);
    assert.equal(validateDisputeTransition('UNDER_REVIEW', 'AWAITING_CUSTOMER').valid, true);
    assert.equal(validateDisputeTransition('UNDER_REVIEW', 'RESOLVED').valid, true);
    assert.equal(validateDisputeTransition('UNDER_REVIEW', 'REJECTED').valid, true);
    assert.equal(validateDisputeTransition('AWAITING_CUSTOMER', 'UNDER_REVIEW').valid, true);
    assert.equal(validateDisputeTransition('AWAITING_CUSTOMER', 'RESOLVED').valid, true);
    assert.equal(validateDisputeTransition('AWAITING_CUSTOMER', 'REJECTED').valid, true);
    assert.equal(validateDisputeTransition('RESOLVED', 'UNDER_REVIEW').valid, true); // Admin reopen
    assert.equal(validateDisputeTransition('REJECTED', 'UNDER_REVIEW').valid, true); // Admin reopen

    // Invalid transitions
    assert.equal(validateDisputeTransition('OPEN', 'RESOLVED').valid, false); // Must go to UNDER_REVIEW first
    assert.equal(validateDisputeTransition('OPEN', 'AWAITING_CUSTOMER').valid, false);
    assert.equal(validateDisputeTransition('REJECTED', 'RESOLVED').valid, false);
  });

  // 2. DISPUTE CREATION VIA CUSTOMER API
  it('allows authenticated customer to file dispute with status OPEN and logs audit trail', async () => {
    const req = new NextRequest('http://localhost:3000/api/complaints', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        orderId: testOrder.id,
        category: 'WEIGHT_DISPUTE',
        description: 'Agent measured 10kg iron instead of the 15kg actual weight on home scale.',
      }),
    });

    const res = await createComplaintRoute(req);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.status, 'OPEN');
    assert.equal(data.data.category, 'WEIGHT_DISPUTE');
    createdDisputeId = data.data.id;
    assert.ok(createdDisputeId);

    // Verify AuditLog record
    const audit = await db.auditLog.findFirst({
      where: {
        action: 'DISPUTE_FILED',
        newValue: { contains: createdDisputeId },
      },
    });
    assert.ok(audit);
  });

  // 3. INVALID TRANSITION BLOCKED BY ADMIN API
  it('blocks invalid direct transition from OPEN to RESOLVED returning 400', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/complaints', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: createdDisputeId,
        status: 'RESOLVED',
        resolutionNotes: 'Skipped review directly to resolved',
      }),
    });

    const res = await adminUpdateComplaintRoute(req);
    const data = await res.json();

    assert.equal(res.status, 400);
    assert.equal(data.success, false);
    assert.ok(data.message.includes('Illegal status transition') || data.message.includes('transition'));
  });

  // 4. TRANSITION TO UNDER_REVIEW
  it('allows admin to transition OPEN dispute to UNDER_REVIEW with internal notes', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/complaints', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: createdDisputeId,
        status: 'UNDER_REVIEW',
        customerUpdate: 'Operations team is reviewing pickup weighing logs.',
        internalNotes: 'Contacted agent Suresh to check digital scale calibration certificate.',
      }),
    });

    const res = await adminUpdateComplaintRoute(req);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.status, 'UNDER_REVIEW');

    // Verify Notification created for Customer A
    const notif = await db.notification.findFirst({
      where: {
        userId: customerA.id,
        type: 'WHATSAPP',
      },
      orderBy: { sentAt: 'desc' },
    });
    assert.ok(notif);
    assert.ok(
      notif.content.toUpperCase().includes('UNDER REVIEW') ||
      notif.content.toUpperCase().includes('UNDER_REVIEW')
    );
  });

  // 5. TRANSITION TO AWAITING_CUSTOMER
  it('allows admin to request customer evidence transitioning to AWAITING_CUSTOMER', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/complaints', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: createdDisputeId,
        status: 'AWAITING_CUSTOMER',
        customerUpdate: 'Please upload a photo of your receipt or scale measurement.',
        internalNotes: 'Scale was calibrated last week; awaiting customer photo.',
      }),
    });

    const res = await adminUpdateComplaintRoute(req);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.data.status, 'AWAITING_CUSTOMER');
  });

  // 6. CUSTOMER EVIDENCE SUBMISSION
  it('allows customer to submit evidence/response when AWAITING_CUSTOMER, moving back to UNDER_REVIEW', async () => {
    const req = new NextRequest(`http://localhost:3000/api/complaints/${createdDisputeId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenA}`,
      },
      body: JSON.stringify({
        responseNotes: 'Here is the photo of the scrap before pickup showing 15kg on digital scale.',
        photoUrl: 'https://storage.junkitout.com/disputes/scale-photo-15kg.jpg',
      }),
    });

    const res = await customerRespondRoute(req, { params: Promise.resolve({ id: createdDisputeId }) });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.equal(data.data.status, 'UNDER_REVIEW'); // Automatically moved back to UNDER_REVIEW!
  });

  // 7. INTERNAL NOTES PRIVACY VERIFICATION
  it('ensures internal notes are strictly hidden from customer view in GET /api/complaints/[id]', async () => {
    const req = new NextRequest(`http://localhost:3000/api/complaints/${createdDisputeId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenA}`,
      },
    });

    const res = await getComplaintDetailRoute(req, { params: Promise.resolve({ id: createdDisputeId }) });
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    assert.ok(Array.isArray(data.data.timeline));
    assert.ok(data.data.timeline.length >= 3); // Initial + 2 admin updates + 1 customer response

    // Verify internal notes are NOT present in any timeline item
    const rawTimelineStr = JSON.stringify(data.data.timeline);
    assert.equal(rawTimelineStr.includes('Contacted agent Suresh'), false);
    assert.equal(rawTimelineStr.includes('calibration certificate'), false);

    // Verify customer update IS present in timeline
    assert.ok(rawTimelineStr.includes('Please upload a photo of your receipt'));
  });

  // 8. ACCESS CONTROL — CUSTOMER B CANNOT VIEW CUSTOMER A'S DISPUTE
  it('returns 403 Forbidden when Customer B attempts to access Customer A dispute', async () => {
    const req = new NextRequest(`http://localhost:3000/api/complaints/${createdDisputeId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenB}`,
      },
    });

    const res = await getComplaintDetailRoute(req, { params: Promise.resolve({ id: createdDisputeId }) });
    const data = await res.json();

    assert.equal(res.status, 403);
    assert.equal(data.success, false);
    assert.ok(data.message.includes('authorized') || data.message.includes('Forbidden'));
  });

  // 9. FINAL RESOLUTION BY ADMIN
  it('allows admin to transition UNDER_REVIEW to RESOLVED with settlement notes', async () => {
    const req = new NextRequest('http://localhost:3000/api/admin/complaints', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: createdDisputeId,
        status: 'RESOLVED',
        resolutionNotes: 'Dispute validated: ₹60 price adjustment credited to customer wallet.',
        customerUpdate: 'We verified the scale difference. ₹60 has been credited to your Junk It Out wallet.',
      }),
    });

    const res = await adminUpdateComplaintRoute(req);
    const data = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.data.status, 'RESOLVED');

    // Customer detail check
    const custReq = new NextRequest(`http://localhost:3000/api/complaints/${createdDisputeId}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const custRes = await getComplaintDetailRoute(custReq, { params: Promise.resolve({ id: createdDisputeId }) });
    const custData = await custRes.json();

    assert.equal(custData.data.status, 'RESOLVED');
    assert.ok(custData.data.resolutionDetails.includes('₹60'));
  });
});
