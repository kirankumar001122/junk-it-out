import assert from 'node:assert/strict';
import { describe, it, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as supportChatRoute } from '../app/api/support/chat/route';
import { POST as createComplaintRoute, GET as getComplaintsRoute } from '../app/api/complaints/route';
import { GET as getComplaintDetailRoute } from '../app/api/complaints/[id]/route';
import { PUT as adminUpdateComplaintRoute } from '../app/api/admin/complaints/route';
import {
  generateFallbackSupportResponse,
  getLiveMaterialsAndPricing,
  getLiveServiceAreas,
  getSubscriptionPlans,
  getAuthenticatedCustomerWallet,
  createLiveSupportComplaint,
  SupportChatContext,
} from '../lib/ai/supportAgent';
import {
  logSupportConversationTurn,
  getSupportConversationHistory,
  logUnresolvedQuestion,
  getUnresolvedSupportQueries,
} from '../lib/ai/unresolvedQueries';
import {
  validateDisputeTransition,
  PERMITTED_DISPUTE_TRANSITIONS,
  DISPUTE_STATUSES,
  DisputeStatus,
} from '../lib/validations/disputeTransitions';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

describe('FINAL ACCEPTANCE AUDIT: Support Chatbot (F04) & Dispute Management (F05)', () => {
  let customerUser: any;
  let customerToken: string;
  let unauthorizedCustomer: any;
  let unauthorizedToken: string;
  let adminUser: any;
  let adminToken: string;
  let testOrder: any;
  let testDisputeId: string;

  beforeAll(async () => {
    // 1. Create primary test customer
    const phone = `+91995${Math.floor(1000000 + Math.random() * 9000000)}`;
    customerUser = await db.user.create({
      data: {
        phone,
        name: 'Audit Customer',
        email: `audit_${Date.now()}@example.com`,
        role: 'CUSTOMER',
        tokenVersion: 1,
        customer: { create: { referralCode: `AUDIT${Date.now().toString(36)}` } },
      },
      include: { customer: true },
    });
    customerToken = signToken({
      userId: customerUser.id,
      phone: customerUser.phone,
      role: 'CUSTOMER',
      tokenVersion: 1,
      customerId: customerUser.customer.id,
    });

    // 2. Create unauthorized customer (for cross-tenant checks)
    const phoneUnauthorized = `+91996${Math.floor(1000000 + Math.random() * 9000000)}`;
    unauthorizedCustomer = await db.user.create({
      data: {
        phone: phoneUnauthorized,
        name: 'Unauthorized Cross Customer',
        email: `unauth_${Date.now()}@example.com`,
        role: 'CUSTOMER',
        tokenVersion: 1,
        customer: { create: { referralCode: `UNAUTH${Date.now().toString(36)}` } },
      },
      include: { customer: true },
    });
    unauthorizedToken = signToken({
      userId: unauthorizedCustomer.id,
      phone: unauthorizedCustomer.phone,
      role: 'CUSTOMER',
      tokenVersion: 1,
    });

    // 3. Create Admin user
    const adminPhone = `+91997${Math.floor(1000000 + Math.random() * 9000000)}`;
    adminUser = await db.user.create({
      data: {
        phone: adminPhone,
        name: 'Audit Admin',
        email: `admin_audit_${Date.now()}@example.com`,
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

    // 4. Create Address & Order
    const address = await db.address.create({
      data: {
        userId: customerUser.id,
        name: 'Home',
        phone,
        houseNo: '100',
        street: '14th Main',
        area: 'JP Nagar',
        city: 'Bengaluru',
        pincode: '560078',
        lat: 12.9081,
        lng: 77.5843,
      },
    });

    testOrder = await db.order.create({
      data: {
        orderNumber: `ORD-AUDIT-${Date.now()}`,
        customerId: customerUser.customer.id,
        addressId: address.id,
        status: 'COMPLETED',
        estimatedTotal: 400,
        finalAmount: 400,
        pickupCharge: 0,
      },
    });

    // 5. Ensure wallet exists
    await db.customerWallet.upsert({
      where: { customerId: customerUser.customer.id },
      create: { customerId: customerUser.customer.id, balance: 150 },
      update: { balance: 150 },
    });
  });

  afterAll(async () => {
    try {
      if (customerUser?.customer?.id) {
        await db.complaint.deleteMany({ where: { customerId: customerUser.customer.id } }).catch(() => null);
        await db.walletTransaction.deleteMany({ where: { wallet: { customerId: customerUser.customer.id } } }).catch(() => null);
        await db.customerWallet.deleteMany({ where: { customerId: customerUser.customer.id } }).catch(() => null);
      }
      if (testDisputeId) {
        await db.complaint.delete({ where: { id: testDisputeId } }).catch(() => null);
      }
      if (testOrder?.id) await db.order.delete({ where: { id: testOrder.id } }).catch(() => null);
      if (customerUser?.id) {
        await db.notification.deleteMany({ where: { userId: customerUser.id } }).catch(() => null);
        await db.address.deleteMany({ where: { userId: customerUser.id } }).catch(() => null);
        await db.customer.deleteMany({ where: { userId: customerUser.id } }).catch(() => null);
        await db.user.delete({ where: { id: customerUser.id } }).catch(() => null);
      }
      if (unauthorizedCustomer?.id) {
        await db.customer.deleteMany({ where: { userId: unauthorizedCustomer.id } }).catch(() => null);
        await db.user.delete({ where: { id: unauthorizedCustomer.id } }).catch(() => null);
      }
      if (adminUser?.id) {
        await db.user.delete({ where: { id: adminUser.id } }).catch(() => null);
      }
    } catch {
      // Best effort cleanup
    }
  });

  // ==========================================
  // AREA 1: CHATBOT AUDIT
  // ==========================================
  describe('Area 1: Chatbot Audit & Grounding', () => {
    it('1.1: confirms complete conversation history is persistently logged, not only unresolved questions', async () => {
      const testQuery = `Audit conversation test query ${Date.now()}`;
      const context: SupportChatContext = {
        userId: customerUser.id,
        customerId: customerUser.customer.id,
        phone: customerUser.phone,
        name: customerUser.name,
        role: 'CUSTOMER',
      };

      const req = new NextRequest('http://localhost:3000/api/support/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({ message: testQuery }),
      });

      const res = await supportChatRoute(req);
      const data = await res.json();

      assert.equal(res.status, 200);
      assert.equal(data.success, true);
      assert.ok(data.text);

      // Verify conversation turn is stored in db.auditLog with action SUPPORT_CONVERSATION_TURN
      const auditLog = await db.auditLog.findFirst({
        where: {
          action: 'SUPPORT_CONVERSATION_TURN',
          oldValue: { contains: testQuery },
        },
      });

      assert.ok(auditLog, 'Audit log must contain a SUPPORT_CONVERSATION_TURN entry');
      const parsed = JSON.parse(auditLog.newValue || '{}');
      assert.equal(parsed.userMessage, testQuery);
      assert.equal(parsed.assistantResponse, data.text);
      assert.equal(parsed.customerId, customerUser.customer.id);
      assert.equal(parsed.channel, 'WEB_SUPPORT_CHAT');
    });

    it('1.2: confirms human escalation creates a real support request in db.complaint with authoritative reference ID', async () => {
      const context: SupportChatContext = {
        userId: customerUser.id,
        customerId: customerUser.customer.id,
        phone: customerUser.phone,
        name: customerUser.name,
        role: 'CUSTOMER',
      };

      const escalationQuery = 'I want to speak with a human support agent immediately regarding my order';
      const response = await generateFallbackSupportResponse(escalationQuery, context);

      assert.ok(response.text.includes('JIO-') || response.referenceId);
      assert.ok(response.referenceId, 'Fallback escalation must return referenceId');

      // Check that complaint ticket actually exists in database
      const ticket = await db.complaint.findFirst({
        where: {
          customerId: customerUser.customer.id,
          category: 'HUMAN_SUPPORT_ESCALATION',
        },
        orderBy: { createdAt: 'desc' },
      });

      assert.ok(ticket, 'Escalation ticket must be stored in db.complaint');
      assert.equal(ticket.status, 'OPEN');
      assert.ok(response.referenceId?.includes(ticket.id.slice(0, 8).toUpperCase()));
    });

    it('1.3: verifies authoritative live data retrieval (pricing, subscriptions, wallet, service areas)', async () => {
      // Live materials and pricing
      const livePricing = await getLiveMaterialsAndPricing();
      assert.equal(livePricing.success, true);
      assert.ok(livePricing.materials.length > 0);
      for (const m of livePricing.materials) {
        assert.ok(typeof m.pricePerKg === 'number');
        assert.ok(m.pricePerKg > 0);
      }

      // Live service areas (exclusively BTM & JP Nagar)
      const serviceAreas = await getLiveServiceAreas();
      assert.equal(serviceAreas.success, true);
      const allAreas = [...serviceAreas.primaryZones, ...serviceAreas.activeAreas].map((a) => a.toLowerCase());
      assert.ok(allAreas.some((a) => a.includes('btm layout')));
      assert.ok(allAreas.some((a) => a.includes('jp nagar')));

      // Subscriptions
      const subPlans = await getSubscriptionPlans({ customerId: customerUser.customer.id });
      assert.equal(subPlans.success, true);
      assert.ok(subPlans.plans.length >= 3);

      // Customer Wallet
      const walletRes = await getAuthenticatedCustomerWallet({ customerId: customerUser.customer.id });
      assert.equal(walletRes.success, true);
      assert.equal(walletRes.balance, 150);
    });
  });

  // ==========================================
  // AREA 2: DISPUTES AUDIT
  // ==========================================
  describe('Area 2: Disputes Lifecycle & Security Audit', () => {
    it('2.1: verifies every permitted and forbidden status transition matrix', () => {
      // Permitted transitions
      const permittedPairs: [DisputeStatus, DisputeStatus][] = [
        ['OPEN', 'UNDER_REVIEW'],
        ['OPEN', 'REJECTED'],
        ['UNDER_REVIEW', 'AWAITING_CUSTOMER'],
        ['UNDER_REVIEW', 'RESOLVED'],
        ['UNDER_REVIEW', 'REJECTED'],
        ['AWAITING_CUSTOMER', 'UNDER_REVIEW'],
        ['AWAITING_CUSTOMER', 'RESOLVED'],
        ['AWAITING_CUSTOMER', 'REJECTED'],
        ['RESOLVED', 'UNDER_REVIEW'],
        ['REJECTED', 'UNDER_REVIEW'],
      ];

      for (const [from, to] of permittedPairs) {
        const check = validateDisputeTransition(from, to);
        assert.equal(
          check.valid,
          true,
          `Expected transition from ${from} to ${to} to be PERMITTED, but got error: ${check.error}`
        );
      }

      // Forbidden transitions
      const forbiddenPairs: [DisputeStatus, DisputeStatus][] = [
        ['OPEN', 'RESOLVED'], // Cannot resolve directly without review
        ['OPEN', 'AWAITING_CUSTOMER'], // Cannot jump straight to awaiting customer
        ['RESOLVED', 'OPEN'], // Cannot reset to OPEN
        ['RESOLVED', 'REJECTED'], // Cannot reject an already resolved dispute directly
        ['REJECTED', 'OPEN'], // Cannot reset to OPEN
        ['REJECTED', 'RESOLVED'], // Cannot resolve directly from rejected
        ['RESOLVED', 'AWAITING_CUSTOMER'], // Cannot jump to awaiting customer
      ];

      for (const [from, to] of forbiddenPairs) {
        const check = validateDisputeTransition(from, to);
        assert.equal(
          check.valid,
          false,
          `Expected transition from ${from} to ${to} to be FORBIDDEN, but passed validation`
        );
      }
    });

    it('2.2: customer creates dispute (status OPEN) and admin transitions through lifecycle', async () => {
      // Customer creates dispute
      const createReq = new NextRequest('http://localhost:3000/api/complaints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${customerToken}`,
        },
        body: JSON.stringify({
          orderId: testOrder.id,
          category: 'PRICE_DISPUTE',
          description: 'Material was categorized as mixed scrap instead of premium copper.',
        }),
      });

      const createRes = await createComplaintRoute(createReq);
      const createData = await createRes.json();
      assert.equal(createRes.status, 200);
      assert.equal(createData.data.status, 'OPEN');
      testDisputeId = createData.data.id;

      // Admin transitions to UNDER_REVIEW
      const reviewReq = new NextRequest('http://localhost:3000/api/admin/complaints', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({
          id: testDisputeId,
          status: 'UNDER_REVIEW',
          internalNotes: 'SECRET_INTERNAL_NOTE: Checking warehouse supervisor notes.',
          customerUpdate: 'We are reviewing your metal classification photos.',
        }),
      });

      const reviewRes = await adminUpdateComplaintRoute(reviewReq);
      const reviewData = await reviewRes.json();
      assert.equal(reviewRes.status, 200);
      assert.equal(reviewData.data.status, 'UNDER_REVIEW');
    });

    it('2.3: confirms internal notes NEVER appear in customer API responses', async () => {
      // 1. Check GET /api/complaints (list endpoint)
      const listReq = new NextRequest('http://localhost:3000/api/complaints', {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const listRes = await getComplaintsRoute(listReq);
      const listData = await listRes.json();
      const listJsonStr = JSON.stringify(listData);
      assert.equal(
        listJsonStr.includes('SECRET_INTERNAL_NOTE'),
        false,
        'Internal notes must NOT appear in GET /api/complaints'
      );

      // 2. Check GET /api/complaints/[id] (detail endpoint with timeline)
      const detailReq = new NextRequest(`http://localhost:3000/api/complaints/${testDisputeId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${customerToken}` },
      });
      const detailRes = await getComplaintDetailRoute(detailReq, {
        params: Promise.resolve({ id: testDisputeId }),
      });
      const detailData = await detailRes.json();
      const detailJsonStr = JSON.stringify(detailData);

      assert.equal(
        detailJsonStr.includes('SECRET_INTERNAL_NOTE'),
        false,
        'Internal notes must NOT appear in GET /api/complaints/[id]'
      );
      assert.equal(detailData.data.internalNotes, undefined);

      // Verify customerUpdate is visible to customer
      assert.ok(detailJsonStr.includes('We are reviewing your metal classification photos.'));
    });

    it('2.4: confirms customer notifications are actually dispatched to db.notification with type WHATSAPP', async () => {
      const notif = await db.notification.findFirst({
        where: {
          userId: customerUser.id,
          type: 'WHATSAPP',
        },
        orderBy: { sentAt: 'desc' },
      });

      assert.ok(notif, 'Customer notification record must be created');
      assert.equal(notif.status, 'QUEUED', 'Must not be marked SENT without provider confirmation');
      assert.equal(notif.deliveryStatus, 'pending_provider_template');
      assert.ok(notif.content.includes('UNDER REVIEW') || notif.content.includes('Under Review'));
      assert.ok(notif.content.includes('JIO-'));
    });

    it('2.5: verifies customer ownership and authorization (403 for other customers, 401 for unauthenticated)', async () => {
      // Unauthenticated customer -> 401
      const unauthReq = new NextRequest(`http://localhost:3000/api/complaints/${testDisputeId}`, {
        method: 'GET',
      });
      const unauthRes = await getComplaintDetailRoute(unauthReq, {
        params: Promise.resolve({ id: testDisputeId }),
      });
      assert.equal(unauthRes.status, 401);

      // Customer B viewing Customer A dispute -> 403 Forbidden
      const crossReq = new NextRequest(`http://localhost:3000/api/complaints/${testDisputeId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${unauthorizedToken}` },
      });
      const crossRes = await getComplaintDetailRoute(crossReq, {
        params: Promise.resolve({ id: testDisputeId }),
      });
      assert.equal(crossRes.status, 403);
      const crossData = await crossRes.json();
      assert.equal(crossData.success, false);
      assert.ok(crossData.message.includes('not authorized'));
    });
  });
});
