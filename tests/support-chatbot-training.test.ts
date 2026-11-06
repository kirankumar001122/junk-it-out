import assert from 'node:assert/strict';
import { describe, it, beforeAll, afterAll } from 'vitest';
import {
  generateFallbackSupportResponse,
  getAuthenticatedCustomerWallet,
  getSubscriptionPlans,
  getAuthenticatedCustomerDisputes,
  getLiveMaterialsAndPricing,
  getLiveServiceAreas,
  calculateLiveEstimate,
  SupportChatContext,
} from '../lib/ai/supportAgent';
import { logUnresolvedQuestion, getUnresolvedSupportQueries } from '../lib/ai/unresolvedQueries';
import { notifySupportEscalation } from '../lib/ai/supportEscalation';
import { db } from '../lib/db';

describe('FEATURE 04: Support Chatbot — Placement, Grounded Training & Unresolved Queries', () => {
  let testCustomer: any;
  let testAddress: any;
  let testOrder: any;

  beforeAll(async () => {
    const phone = `+91991${Math.floor(1000000 + Math.random() * 9000000)}`;
    testCustomer = await db.user.create({
      data: {
        phone,
        name: 'Chatbot Grounded Test Customer',
        email: `chatbot_${Date.now()}@example.com`,
        role: 'CUSTOMER',
        tokenVersion: 1,
        customer: { create: { referralCode: `BOT${Date.now().toString(36)}` } },
      },
      include: { customer: true },
    });

    testAddress = await db.address.create({
      data: {
        userId: testCustomer.id,
        name: 'Home',
        phone,
        houseNo: '55',
        street: '15th Cross',
        area: 'JP Nagar',
        city: 'Bengaluru',
        pincode: '560078',
        lat: 12.9081,
        lng: 77.5843,
      },
    });

    testOrder = await db.order.create({
      data: {
        orderNumber: `ORD-BOT-${Date.now()}`,
        customerId: testCustomer.customer.id,
        addressId: testAddress.id,
        status: 'CONFIRMED',
        estimatedTotal: 250,
        finalAmount: 250,
        pickupCharge: 0,
      },
    });

    // Ensure wallet exists for authenticated test customer
    await db.customerWallet.upsert({
      where: { customerId: testCustomer.customer.id },
      create: { customerId: testCustomer.customer.id, balance: 100 },
      update: { balance: 100 },
    });

    // Ensure sample subscription offers exist for testing
    const countOffers = await db.subscriptionOffer.count();
    if (countOffers === 0) {
      await db.subscriptionOffer.createMany({
        data: [
          {
            name: 'Quarterly Scrap Saver',
            description: '3 months regular pickup plan',
            durationMonths: 3,
            price: 299,
            benefitsJson: JSON.stringify(['Free doorstep pickups', 'Dedicated pickup agent']),
            active: true,
            displayOrder: 1,
          },
          {
            name: 'Six Months Green Champion',
            description: '6 months priority pickup plan',
            durationMonths: 6,
            price: 399,
            benefitsJson: JSON.stringify(['Free doorstep pickups', 'Dedicated agent', 'Priority scheduling']),
            active: true,
            displayOrder: 2,
          },
          {
            name: 'Annual Zero Waste Hero',
            description: '12 months ultimate recycling plan',
            durationMonths: 12,
            price: 599,
            benefitsJson: JSON.stringify(['Unlimited pickups', 'Maximum scrap rates', 'VIP concierge']),
            active: true,
            displayOrder: 3,
          },
        ],
      });
    }

    // Ensure active waste categories exist for testing
    const countMaterials = await db.wasteCategory.count({ where: { active: true } });
    if (countMaterials === 0) {
      await db.wasteCategory.createMany({
        data: [
          {
            name: 'Plastic Waste',
            description: 'Bottles, containers, packaging',
            category: 'Recyclable Plastics',
            pricePerKg: 15,
            active: true,
            displayOrder: 1,
          },
          {
            name: 'Paper & Cardboard',
            description: 'Newspapers, boxes, cartons',
            category: 'Paper & Fibers',
            pricePerKg: 12,
            active: true,
            displayOrder: 2,
          },
          {
            name: 'Metal Scrap',
            description: 'Iron, steel, copper, aluminium',
            category: 'Metals',
            pricePerKg: 28,
            active: true,
            displayOrder: 3,
          },
        ],
      });
    }
  });

  afterAll(async () => {
    try {
      if (testOrder?.id) await db.order.delete({ where: { id: testOrder.id } }).catch(() => null);
      if (testAddress?.id) await db.address.delete({ where: { id: testAddress.id } }).catch(() => null);
      if (testCustomer?.id) {
        await db.customer.deleteMany({ where: { userId: testCustomer.id } }).catch(() => null);
        await db.user.delete({ where: { id: testCustomer.id } }).catch(() => null);
      }
    } catch {
      // Clean up best effort
    }
  });

  const getContext = (): SupportChatContext => ({
    userId: testCustomer.id,
    customerId: testCustomer.customer.id,
    phone: testCustomer.phone,
    name: testCustomer.name,
    role: 'CUSTOMER',
  });

  // 1. DOMAIN 1: BOOKING & SCHEDULING
  it('retrieves accurate booking & scheduling knowledge (service areas, ETA, operational hours)', async () => {
    const areasRes = await getLiveServiceAreas();
    const areaList = areasRes.activeAreas || areasRes.primaryZones || [];
    assert.ok(Array.isArray(areaList));
    assert.ok(areaList.length > 0);
    const areaNames = areaList.map((a: string) => a.toLowerCase());
    assert.ok(areaNames.some((n: string) => n.includes('jp nagar') || n.includes('btm layout')));

    const prompt = 'How do I book a pickup and what are your service hours?';
    const response = await generateFallbackSupportResponse(prompt, getContext());

    assert.ok(response.text.includes('JP Nagar') || response.text.includes('BTM Layout'));
    assert.ok(response.text.includes('20-30 minute') || response.text.includes('8:00 AM'));
  });

  // 2. DOMAIN 2: PRICING & SCRAP MATERIALS
  it('retrieves accurate pricing, scrap rates, and fee rules (>7kg free pickup)', async () => {
    const materialsRes = await getLiveMaterialsAndPricing();
    const materials = materialsRes.materials || [];
    assert.ok(Array.isArray(materials));
    assert.ok(materials.length > 0);

    const estimateUnder7 = await calculateLiveEstimate([{ categoryName: materials[0].name, weightKg: 5 }]);
    assert.equal(estimateUnder7.items[0].isOfferApplied, false);
    assert.equal(estimateUnder7.isServiceChargeWaived, true);

    const estimateOver7 = await calculateLiveEstimate([{ categoryName: materials[0].name, weightKg: 10 }]);
    assert.equal(estimateOver7.items[0].isOfferApplied, true);

    const prompt = 'What are your scrap rates and pickup fee rules?';
    const response = await generateFallbackSupportResponse(prompt, getContext());
    assert.ok(response.text.includes('99') || response.text.includes('7 kg') || response.text.includes('₹50'));
  });

  // 3. DOMAIN 3: WALLETS & TRANSACTIONS
  it('retrieves customer wallet balance, rules, and Razorpay topup information', async () => {
    const wallet = await getAuthenticatedCustomerWallet(getContext());
    assert.ok(wallet.success);
    assert.equal(typeof wallet.balance, 'number');

    const prompt = 'How does the customer wallet work and can I top it up?';
    const response = await generateFallbackSupportResponse(prompt, getContext());
    assert.ok(response.text.toLowerCase().includes('wallet'));
    assert.ok(response.text.toLowerCase().includes('balance'));
  });

  // 4. DOMAIN 4: SUBSCRIPTION PLANS
  it('retrieves subscription tiers, pricing, and benefits accurately', async () => {
    const plansRes = await getSubscriptionPlans(getContext());
    const plans = plansRes.plans || [];
    assert.ok(Array.isArray(plans));
    assert.ok(plans.some((p: any) => p.name.includes('Quarterly') && p.price === 299));
    assert.ok(plans.some((p: any) => p.name.includes('Six Months') && p.price === 399));
    assert.ok(plans.some((p: any) => p.name.includes('Annual') && p.price === 599));

    const prompt = 'Tell me about your scrap subscription plans and pricing';
    const response = await generateFallbackSupportResponse(prompt, getContext());
    assert.ok(response.text.includes('Quarterly') || response.text.includes('299'));
    assert.ok(response.text.includes('Annual') || response.text.includes('599'));
  });

  // 5. DOMAIN 5: DISPUTE MANAGEMENT & WEIGHT VERIFICATION
  it('explains the 5-stage dispute lifecycle and weight verification process', async () => {
    const prompt = 'What if the agent measured the wrong weight? How do disputes work?';
    const response = await generateFallbackSupportResponse(prompt, getContext());
    assert.ok(response.text.includes('OPEN') || response.text.includes('UNDER_REVIEW') || response.text.includes('AWAITING_CUSTOMER'));
    assert.ok(response.text.includes('digital scale') || response.text.includes('support ticket'));
  });

  // 6. DOMAIN 6: REFUNDS & SCRAP PAYOUTS
  it('explains cancellation refund windows (100% pre-arrival) and scrap payout methods', async () => {
    const prompt = 'How do refunds and scrap payouts work?';
    const response = await generateFallbackSupportResponse(prompt, getContext());
    assert.ok(response.text.includes('100% refund') || response.text.includes('Razorpay') || response.text.includes('3-5 business days'));
    assert.ok(response.text.includes('UPI') || response.text.includes('bank transfer'));
  });

  // 7. UNRESOLVED QUERY LOGGING
  it('logs out-of-domain questions to AuditLog and provides honest escalation fallback', async () => {
    const outOfDomainQuestion = 'Can you trade Bitcoin for me or write my college homework?';
    const context = getContext();

    await logUnresolvedQuestion(outOfDomainQuestion, context, 'OUT_OF_DOMAIN');

    // Verify persisted in DB
    const recentUnresolved = await getUnresolvedSupportQueries(10);
    assert.ok(recentUnresolved.some((q: any) => q.details?.query === outOfDomainQuestion));

    // Verify fallback response does not fabricate
    const response = await generateFallbackSupportResponse(outOfDomainQuestion, context);
    assert.ok(response.text.includes('operations desk') || response.text.includes('support ticket') || response.text.includes('human'));
    assert.ok(!response.text.toLowerCase().includes('bitcoin')); // Did not hallucinate Bitcoin trading advice
  });

  // 8. ESCALATION DELIVERY
  it('formats and dispatches human escalation correctly', async () => {
    const escalationResult = await notifySupportEscalation({
      customerName: testCustomer.name,
      customerPhone: testCustomer.phone,
      question: 'Need urgent supervisor intervention',
      summary: 'Escalation test',
      ticketId: 'TEST-ESC-123',
    });
    // In test environment without webhook URL, returns 'not_configured' safely without throwing
    assert.ok(escalationResult === 'not_configured' || escalationResult === 'sent');
  });
});
