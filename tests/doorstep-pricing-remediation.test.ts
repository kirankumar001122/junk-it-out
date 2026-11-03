import assert from 'node:assert/strict';
import { calculateOrderValuation } from '../lib/pricing';

async function run() {
  console.log('--- STARTING DOORSTEP PRICING & BOOKING VALUATION REGRESSION TESTS ---');

  // TEST 1: Booking Pricing Calculation
  // 3 items: Household dry waste (1kg @ ₹8), Plastic (1kg @ ₹18), Paper & Cardboard (1kg @ ₹14)
  // Total scrap value: 8 + 18 + 14 = ₹40.00
  // Pickup service charge: ₹50.00
  // Customer upfront payable MUST be ₹50.00 (service fee), NOT ₹109.00!
  console.log('Test 1: Booking pricing calculation separates scrap earnings from service charge...');
  {
    const items = [
      { categoryId: 'cat-dry', categoryName: 'Household Dry Waste', type: 'RECYCLABLE_BUY', pricePerKg: 8.0, weightKg: 1 },
      { categoryId: 'cat-plastic', categoryName: 'Plastic Waste', type: 'RECYCLABLE_BUY', pricePerKg: 18.0, weightKg: 1 },
      { categoryId: 'cat-paper', categoryName: 'Paper & Cardboard', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, weightKg: 1 },
    ];
    const basePickupCharge = 50.0;
    const valuation = calculateOrderValuation(items, basePickupCharge, 0.0);

    assert.equal(valuation.totalRecyclableValue, 40.0, 'Scrap buy value should be ₹40.00');
    assert.equal(valuation.totalWasteCharge, 0.0, 'No disposal charges');
    assert.equal(valuation.basePickupCharge, 50.0, 'Pickup charge should be ₹50.00');
    assert.equal(valuation.totalCustomerCharges, 50.0, 'Customer upfront payable should be ₹50.00, NOT ₹109.00');
  }

  // TEST 2: Doorstep Weighing with Captured Booking Payment (Confirmed Reported Example)
  // Pickup charge: ₹50.00 (captured at booking)
  // Doorstep actual weight: 3 kg Paper & Cardboard @ ₹14.00/kg = ₹42.00
  // Result MUST be JUNKITOUT_PAYS ₹42.00 to the customer (NOT CUSTOMER_PAYS ₹8.00)
  console.log('Test 2: Doorstep weighing with already-captured booking fee yields full scrap payout...');
  {
    const items = [
      { categoryId: 'cat-paper', categoryName: 'Paper & Cardboard', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, weightKg: 3 },
    ];
    const order = {
      pickupCharge: 50.0,
      paymentStatus: 'CAPTURED',
      discountAmount: 0.0,
    };

    const isBookingPaid = order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS';
    const uncollectedPickupCharge = isBookingPaid ? 0 : order.pickupCharge;

    const valuation = calculateOrderValuation(items, uncollectedPickupCharge, order.discountAmount);

    assert.equal(valuation.totalRecyclableValue, 42.0, 'Scrap valuation should be ₹42.00');
    assert.equal(valuation.financialDirection, 'JUNKITOUT_PAYS', 'Financial direction must be JUNKITOUT_PAYS');
    assert.equal(valuation.netAmount, 42.0, 'Customer should receive full ₹42.00 scrap valuation, not owe ₹8');
  }

  // TEST 3: Doorstep Weighing with Captured Booking Payment (10 kg Plastic Screenshot Example)
  // Pickup charge: ₹39.00 (captured at booking)
  // Doorstep actual weight: 10 kg Plastic Waste @ ₹18.00/kg = ₹180.00
  // Result MUST be JUNKITOUT_PAYS ₹180.00 to the customer (NOT ₹141.00)
  console.log('Test 3: Doorstep completion with already-captured booking fee does not double-deduct pickup fee...');
  {
    const items = [
      { categoryId: 'cat-plastic', categoryName: 'Plastic Waste', type: 'RECYCLABLE_BUY', pricePerKg: 18.0, weightKg: 10 },
    ];
    const order = {
      pickupCharge: 39.0,
      paymentStatus: 'CAPTURED',
      discountAmount: 0.0,
    };

    const isBookingPaid = order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS';
    const uncollectedPickupCharge = isBookingPaid ? 0 : order.pickupCharge;

    const valuation = calculateOrderValuation(items, uncollectedPickupCharge, order.discountAmount);

    assert.equal(valuation.totalRecyclableValue, 180.0, 'Scrap valuation should be ₹180.00');
    assert.equal(valuation.financialDirection, 'JUNKITOUT_PAYS', 'Financial direction must be JUNKITOUT_PAYS');
    assert.equal(valuation.netAmount, 180.0, 'Customer payout must be ₹180.00, not ₹141.00');
  }

  // TEST 4: Doorstep Weighing with Unpaid Booking Payment
  // Pickup charge: ₹50.00 (payment pending / cash on pickup)
  // Doorstep actual weight: 3 kg Paper & Cardboard @ ₹14.00/kg = ₹42.00
  // Scrap offsets part of the fee: 42 - 50 = -8 -> CUSTOMER_PAYS ₹8.00
  console.log('Test 4: Doorstep weighing with uncollected booking fee correctly offsets fee against scrap...');
  {
    const items = [
      { categoryId: 'cat-paper', categoryName: 'Paper & Cardboard', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, weightKg: 3 },
    ];
    const order = {
      pickupCharge: 50.0,
      paymentStatus: 'PENDING',
      discountAmount: 0.0,
    };

    const isBookingPaid = order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS';
    const uncollectedPickupCharge = isBookingPaid ? 0 : order.pickupCharge;

    const valuation = calculateOrderValuation(items, uncollectedPickupCharge, order.discountAmount);

    assert.equal(valuation.totalRecyclableValue, 42.0);
    assert.equal(valuation.financialDirection, 'CUSTOMER_PAYS', 'Customer must pay remaining fee balance');
    assert.equal(valuation.netAmount, 8.0, 'Customer owes ₹8.00 remaining balance');
  }

  // TEST 5: Doorstep Weighing with Additional Disposal Charges (WASTE_CHARGE)
  // Pickup charge: ₹50.00 (captured at booking)
  // Recyclable scrap: 3 kg Paper @ ₹14 = ₹42.00
  // Hazardous / Waste disposal charge: 1 kg @ ₹10 = ₹10.00
  // Net payout: 42 - 10 = ₹32.00
  console.log('Test 5: Doorstep weighing correctly deducts disposal charges from scrap payout...');
  {
    const items = [
      { categoryId: 'cat-paper', categoryName: 'Paper & Cardboard', type: 'RECYCLABLE_BUY', pricePerKg: 14.0, weightKg: 3 },
      { categoryId: 'cat-hazardous', categoryName: 'Hazardous Waste', type: 'WASTE_CHARGE', pricePerKg: 10.0, weightKg: 1 },
    ];
    const order = {
      pickupCharge: 50.0,
      paymentStatus: 'CAPTURED',
      discountAmount: 0.0,
    };

    const isBookingPaid = order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS';
    const uncollectedPickupCharge = isBookingPaid ? 0 : order.pickupCharge;

    const valuation = calculateOrderValuation(items, uncollectedPickupCharge, order.discountAmount);

    assert.equal(valuation.totalRecyclableValue, 42.0);
    assert.equal(valuation.totalWasteCharge, 10.0);
    assert.equal(valuation.financialDirection, 'JUNKITOUT_PAYS');
    assert.equal(valuation.netAmount, 32.0, 'Customer receives net ₹32.00 (42 scrap - 10 disposal charge)');
  }

  // TEST 6: Default Order Valuation Parameter Standardized to ₹50
  console.log('Test 6: Order valuation engine defaults base pickup charge to exactly ₹50.00...');
  {
    const items = [
      { categoryId: 'cat-dry', categoryName: 'Household Dry Waste', type: 'RECYCLABLE_BUY', pricePerKg: 8.0, weightKg: 1 },
    ];
    // Invoked without supplying basePickupCharge argument
    const valuation = calculateOrderValuation(items);
    assert.equal(valuation.basePickupCharge, 50.0, 'Default base pickup charge must be ₹50.00');
  }

  // TEST 7: Legacy Service-Area Fallback & Admin Pricing Default Standardized to ₹50
  console.log('Test 7: Admin pricing defaults and service-area fallbacks are standardized to ₹50...');
  {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const rootDir = path.resolve('C:/Users/dega parthiv/Downloads/junk-it-out-service-charge-50');

    const saCode = fs.readFileSync(path.join(rootDir, 'app/api/service-areas/route.ts'), 'utf8');
    assert.match(saCode, /basePickupCharge:\s*defaultZone\?\.basePickupCharge\s*\|\|\s*50/);

    const apCode = fs.readFileSync(path.join(rootDir, 'app/api/admin/pricing/route.ts'), 'utf8');
    assert.match(apCode, /basePickupCharge:\s*50/);
    assert.match(apCode, /minPickupCharge:\s*50/);

    const adminPageCode = fs.readFileSync(path.join(rootDir, 'app/admin/(dashboard)/pricing/page.tsx'), 'utf8');
    assert.match(adminPageCode, /basePickupCharge:\s*50/);
    assert.match(adminPageCode, /minPickupCharge:\s*50/);
  }

  console.log('ALL DOORSTEP PRICING & BOOKING VALUATION REGRESSION TESTS PASSED CLEANLY.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
