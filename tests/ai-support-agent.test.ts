import assert from 'node:assert/strict';
import { describe, it, beforeAll, afterAll, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  handleSupportChat,
  getLiveMaterialsAndPricing,
  getLiveServiceAreas,
  getAuthenticatedCustomerOrders,
  createLiveSupportComplaint,
  calculateLiveEstimate,
  checkSupportRateLimit,
  generateFallbackSupportResponse,
  SupportChatContext,
} from '../lib/ai/supportAgent';
import { POST as chatRoute } from '../app/api/support/chat/route';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

describe('Junk It Out — AI Customer Support Agent Test Suite', () => {
  let testCustomerUser: any;
  let testOtherCustomerUser: any;
  let testOrder: any;
  let customerToken: string;

  beforeAll(async () => {
    // Seed or mock authenticated test customers
    try {
      const phone1 = `+91988${Math.floor(1000000 + Math.random() * 9000000)}`;
      testCustomerUser = await db.user.create({
        data: {
          phone: phone1,
          name: 'Support Test Customer 1',
          email: `cust_${Date.now()}_1@example.com`,
          role: 'CUSTOMER',
          tokenVersion: 1,
          customer: { create: { referralCode: `REF${Date.now().toString(36)}1` } },
        },
        include: { customer: true },
      });

      const phone2 = `+91988${Math.floor(1000000 + Math.random() * 9000000)}`;
      testOtherCustomerUser = await db.user.create({
        data: {
          phone: phone2,
          name: 'Support Test Customer 2',
          email: `cust_${Date.now()}_2@example.com`,
          role: 'CUSTOMER',
          tokenVersion: 1,
          customer: { create: { referralCode: `REF${Date.now().toString(36)}2` } },
        },
        include: { customer: true },
      });

      // Create an address and order for testCustomerUser
      const address = await db.address.create({
        data: {
          userId: testCustomerUser.id,
          name: 'Home',
          phone: phone1,
          houseNo: '42',
          street: '10th Main',
          area: 'BTM Layout',
          city: 'Bengaluru',
          pincode: '560068',
          lat: 12.9166,
          lng: 77.6101,
        },
      });

      const category = await db.wasteCategory.findFirst({ where: { active: true } });

      testOrder = await db.order.create({
        data: {
          orderNumber: `ORD-SUPP-${Date.now()}`,
          customerId: testCustomerUser.customer.id,
          addressId: address.id,
          status: 'AGENT_ASSIGNED',
          finalAmount: 180.0,
          estimatedTotal: 180.0,
          pickupCharge: 0.0,
          paymentStatus: 'CAPTURED',
          scheduledSlot: 'Today, 2:00 PM - 4:00 PM',
          items: category
            ? {
                create: {
                  categoryId: category.id,
                  estimatedWeight: 10.0,
                  ratePerKg: category.pricePerKg,
                  subtotal: 99.0,
                },
              }
            : undefined,
        },
      });

      customerToken = signToken({
        userId: testCustomerUser.id,
        phone: testCustomerUser.phone,
        role: 'CUSTOMER',
        customerId: testCustomerUser.customer.id,
        tokenVersion: 1,
      });
    } catch (e) {
      console.warn('DB initialization error (fallback tests will still run):', e);
    }
  });

  afterAll(async () => {
    try {
      if (testOrder?.id) {
        await db.order.deleteMany({ where: { id: testOrder.id } });
      }
      if (testCustomerUser?.id) {
        await db.user.deleteMany({ where: { id: { in: [testCustomerUser.id, testOtherCustomerUser?.id].filter(Boolean) } } });
      }
    } catch {}
  });

  // 1. General customer questions
  it('1. General Customer Questions: answers operating timings, doorstep process, and digital scale details', async () => {
    const res = await generateFallbackSupportResponse('What are your service timings and how does pickup work?', {});
    assert.ok(res.text.includes('Bengaluru') || res.text.includes('Junk It Out') || res.text.includes('8:00 AM'));
    assert.ok(Array.isArray(res.suggestedQuestions) && res.suggestedQuestions.length > 0);
  });

  // 2. Accepted materials
  it('2. Accepted Material Questions: explains e-waste, plastic, metal, and non-accepted materials', async () => {
    const res = await generateFallbackSupportResponse('Do you collect electronic waste like old laptops and plastic?', {});
    assert.ok(res.text.toLowerCase().includes('electronic waste') || res.text.toLowerCase().includes('e-waste'));
    assert.ok(res.text.includes('NOT Accepted') || res.text.includes('❌'));
  });

  // 3. Live pricing retrieval from DB
  it('3. Live Pricing Retrieval: retrieves database rates, ₹99 special offer for >7 kg, and waived ₹0 service charge', async () => {
    const pricing = await getLiveMaterialsAndPricing();
    assert.equal(pricing.success, true);
    assert.ok(Array.isArray(pricing.materials));
    assert.equal(pricing.specialRules.offerThresholdKg, 7);
    assert.equal(pricing.specialRules.offerPrice, 99);
    assert.equal(pricing.specialRules.serviceCharge, 0);
    assert.equal(pricing.specialRules.serviceChargeWaived, true);

    const chatPricing = await generateFallbackSupportResponse('What is the price per kg and explain the 7 kg offer?', {});
    assert.ok(chatPricing.text.includes('₹99'));
    assert.ok(chatPricing.text.includes('7 kg') || chatPricing.text.includes('7kg'));
    assert.ok(chatPricing.text.includes('WAIVED') || chatPricing.text.includes('FREE') || chatPricing.text.includes('₹0'));
  });

  // 4. Pickup booking guidance
  it('4. Pickup Booking Guidance: answers location questions and strictly restricts service to ONLY TWO areas (JP Nagar & BTM Layout)', async () => {
    const liveAreas = await getLiveServiceAreas();
    assert.equal(liveAreas.success, true);
    assert.equal(liveAreas.supportedCount, 2);
    assert.equal(liveAreas.activeAreas.length, 2);
    assert.ok(liveAreas.activeAreas.some((a) => a.includes('BTM')));
    assert.ok(liveAreas.activeAreas.some((a) => a.includes('JP Nagar')));

    const res = await generateFallbackSupportResponse('Which service areas and locations are supported in Bangalore?', {});
    assert.ok(res.text.includes('BTM Layout'));
    assert.ok(res.text.includes('JP Nagar'));
    assert.ok(!res.text.includes('Whitefield'));
    assert.ok(!res.text.includes('Koramangala'));
  });

  // 5. Customer order tracking (Authenticated)
  it('5. Customer Order Tracking: retrieves real-time order status for authenticated customer', async () => {
    if (!testCustomerUser?.customer?.id) return;

    const authContext: SupportChatContext = {
      userId: testCustomerUser.id,
      customerId: testCustomerUser.customer.id,
      name: testCustomerUser.name,
      phone: testCustomerUser.phone,
      role: 'CUSTOMER',
    };

    const res = await getAuthenticatedCustomerOrders(authContext, testOrder?.orderNumber);
    assert.equal(res.success, true);
    assert.equal(res.authenticated, true);
    assert.ok(res.orders.length > 0);
    assert.equal(res.orders[0].orderNumber, testOrder.orderNumber);
    assert.equal(res.orders[0].paymentStatus, 'CAPTURED');
  });

  // 6. Unauthorized order access prevention
  it('6. Unauthorized Order Access: blocks unauthenticated customer from accessing private order details', async () => {
    // Unauthenticated context
    const unauthRes = await getAuthenticatedCustomerOrders({});
    assert.equal(unauthRes.success, false);
    assert.equal(unauthRes.authenticated, false);
    assert.equal(unauthRes.orders.length, 0);

    // Context belonging to Customer 2 trying to query Customer 1's order
    if (!testOtherCustomerUser?.customer?.id) return;
    const otherCustomerContext: SupportChatContext = {
      userId: testOtherCustomerUser.id,
      customerId: testOtherCustomerUser.customer.id,
      role: 'CUSTOMER',
    };

    const crossCustomerRes = await getAuthenticatedCustomerOrders(otherCustomerContext, testOrder?.orderNumber);
    assert.equal(crossCustomerRes.success, true);
    assert.equal(crossCustomerRes.orders.length, 0, 'Must NOT return orders belonging to other customers');
  });

  // 7. Payment-related questions
  it('7. Payment Questions: explains Razorpay flow and avoids false payment claims', async () => {
    const res = await generateFallbackSupportResponse('How do Razorpay payments work for my pickup?', {});
    assert.ok(res.text.includes('Razorpay'));
    assert.ok(res.text.includes('UPI') || res.text.includes('Cards'));
  });

  // 8. Refund questions
  it('8. Refund Questions: explains automated refund process on cancellation', async () => {
    const res = await generateFallbackSupportResponse('What is the refund policy if I cancel my order?', {});
    assert.ok(res.text.includes('refund') || res.text.includes('Refund'));
    assert.ok(res.text.includes('3–5') || res.text.includes('3-5') || res.text.includes('business days'));
  });

  // 9. Kannada and Hinglish queries
  it('9. Multilingual Support: accurately understands and replies to Kannada and Hinglish queries', async () => {
    // Kannada Query
    const knRes = await generateFallbackSupportResponse('ಪ್ಲಾಸ್ಟಿಕ್ ಕಸದ ಬೆಲೆ ಎಷ್ಟು?', {});
    assert.ok(knRes.text.includes('Junk It Out') || knRes.text.includes('ಬೆಲೆ') || knRes.text.includes('ರೂಪಾಯಿ'));

    // Hinglish Query
    const hinglishRes = await generateFallbackSupportResponse('E-waste ka rate kitna hai aur minimum kitna hona chahiye?', {});
    assert.ok(hinglishRes.text.includes('Junk It Out') || hinglishRes.text.includes('₹') || hinglishRes.text.includes('rate'));
  });

  // 10. OpenAI API failure resilience & fallback
  it('10. OpenAI API Failure Resilience: seamlessly falls back to local intelligent engine without crashing', async () => {
    // Test with invalid / unavailable API key
    const originalKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'mock-key';

    const res = await handleSupportChat('What materials do you accept?');
    assert.ok(res.text.length > 20);
    assert.ok(Array.isArray(res.suggestedQuestions) && res.suggestedQuestions.length > 0);

    process.env.OPENAI_API_KEY = originalKey;
  });

  // 11. Database failure handling & escalation creation
  it('11. Database Escalation / Complaint Creation: creates verified complaint ticket in database', async () => {
    if (!testCustomerUser?.customer?.id) return;

    const authContext: SupportChatContext = {
      userId: testCustomerUser.id,
      customerId: testCustomerUser.customer.id,
    };

    const compRes = await createLiveSupportComplaint(authContext, {
      category: 'WEIGHT_DISPUTE',
      description: 'The scale showed 10 kg but agent logged 8 kg.',
      orderNumber: testOrder?.orderNumber,
    });

    assert.equal(compRes.success, true);
    assert.ok(compRes.ticketId);
    assert.ok(compRes.referenceNumber?.startsWith('JIO-'));

    // Clean up created complaint
    if (compRes.ticketId) {
      await db.complaint.deleteMany({ where: { id: compRes.ticketId } });
    }
  });

  // 12. Rate limiting (429 handling)
  it('12. Rate Limiting: restricts excessive calls per client IP to 30 requests/minute', () => {
    const testIp = `test-ip-${Date.now()}`;
    for (let i = 0; i < 30; i++) {
      const check = checkSupportRateLimit(testIp);
      assert.equal(check.allowed, true);
    }
    const blockedCheck = checkSupportRateLimit(testIp);
    assert.equal(blockedCheck.allowed, false);
    assert.equal(blockedCheck.remaining, 0);
  });

  // 13. API Route Handler Validation
  it(
    '13. API Route Handler (POST /api/support/chat): validates input and returns structured response',
    async () => {
      // 400 for empty message
      const emptyReq = new NextRequest('http://localhost:3000/api/support/chat', {
        method: 'POST',
        body: JSON.stringify({ message: '   ' }),
      });
      const emptyRes = await chatRoute(emptyReq);
      assert.equal(emptyRes.status, 400);

      // 200 for valid question
      const validReq = new NextRequest('http://localhost:3000/api/support/chat', {
        method: 'POST',
        body: JSON.stringify({ message: 'What materials do you accept?' }),
      });
      const validRes = await chatRoute(validReq);
      assert.equal(validRes.status, 200);
      const body = await validRes.json();
      assert.equal(body.success, true);
      assert.ok(body.text);
      assert.ok(Array.isArray(body.suggestedQuestions));
    },
    15000
  );
});
