import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  calculateOrderValuation,
  calculatePickupSummary,
  calculateMaterialItemAmount,
  calculateValuationAdjustment,
  calculateBookingTotalPayable,
  ORIGINAL_PICKUP_SERVICE_CHARGE,
  PICKUP_SERVICE_CHARGE,
  SPECIAL_MATERIAL_THRESHOLD_KG,
  SPECIAL_MATERIAL_OFFER_PRICE,
  toPaise,
  toRupees,
} from '../lib/pricing';

describe('Authoritative Pricing Engine', () => {
  describe('toPaise and toRupees conversion', () => {
    it('accurately converts currency amounts without floating-point drift', () => {
      assert.equal(toPaise(19.99), 1999);
      assert.equal(toPaise(0.1 + 0.2), 30);
      assert.equal(toPaise(100.05), 10005);
      assert.equal(toRupees(1999), 19.99);
      assert.equal(toRupees(30), 0.3);
      assert.equal(toRupees(0), 0);
    });

    it('handles negative or invalid values gracefully', () => {
      assert.equal(toPaise(NaN), 0);
      assert.equal(toRupees(Infinity), 0);
    });
  });

  describe('calculateOrderValuation', () => {
    it('separates recyclable value from customer-paid waste charges', () => {
      const result = calculateOrderValuation([
        {
          categoryId: 'recyclable',
          categoryName: 'Paper',
          type: 'RECYCLABLE_BUY',
          pricePerKg: 20,
          weightKg: 10,
        },
        {
          categoryId: 'chargeable',
          categoryName: 'Furniture',
          type: 'WASTE_CHARGE',
          pricePerKg: 15,
          weightKg: 2,
        },
      ], 50);

      assert.equal(result.totalRecyclableValue, 200);
      assert.equal(result.totalWasteCharge, 30);
      assert.equal(result.basePickupCharge, 50);
      assert.equal(result.totalCustomerCharges, 80);
      assert.equal(result.netBalance, 120);
      assert.equal(result.netAmount, 120);
      assert.equal(result.financialDirection, 'JUNKITOUT_PAYS');
      assert.equal(result.summaryLabel, 'Junk It Out pays ₹120.00');
    });

    it('correctly identifies CUSTOMER_PAYS when waste charges exceed recyclable scrap value', () => {
      const result = calculateOrderValuation([
        {
          categoryId: 'scrap',
          categoryName: 'Plastic',
          type: 'RECYCLABLE_BUY',
          pricePerKg: 10,
          weightKg: 2, // ₹20 scrap value
        },
        {
          categoryId: 'heavy',
          categoryName: 'Demolition Debris',
          type: 'WASTE_CHARGE',
          pricePerKg: 25,
          weightKg: 10, // ₹250 waste charge
        },
      ], 69, 0, 30); // ₹69 pickup + ₹30 urgent surcharge = ₹99

      // totalWasteCharge = 250, base = 69, urgent = 30 -> totalCustomerCharges = 349
      // totalRecyclable = 20
      // netBalance = 20 - 349 = -329
      assert.equal(result.totalRecyclableValue, 20);
      assert.equal(result.totalWasteCharge, 250);
      assert.equal(result.basePickupCharge, 69);
      assert.equal(result.urgentSurcharge, 30);
      assert.equal(result.totalCustomerCharges, 349);
      assert.equal(result.netBalance, -329);
      assert.equal(result.netAmount, 329);
      assert.equal(result.financialDirection, 'CUSTOMER_PAYS');
      assert.equal(result.summaryLabel, 'Customer pays ₹329.00');
    });

    it('correctly handles ZERO_BALANCE when scrap value exactly equals customer charges', () => {
      const result = calculateOrderValuation([
        {
          categoryId: 'metal',
          categoryName: 'Iron',
          type: 'RECYCLABLE_BUY',
          pricePerKg: 30,
          weightKg: 3, // ₹90
        },
        {
          categoryId: 'wood',
          categoryName: 'Old Desk',
          type: 'WASTE_CHARGE',
          pricePerKg: 10,
          weightKg: 4, // ₹40
        },
      ], 50); // ₹50 base charge -> totalCustomerCharges = 40 + 50 = ₹90

      assert.equal(result.totalRecyclableValue, 90);
      assert.equal(result.totalCustomerCharges, 90);
      assert.equal(result.netBalance, 0);
      assert.equal(result.netAmount, 0);
      assert.equal(result.financialDirection, 'ZERO_BALANCE');
      assert.equal(result.summaryLabel, 'Zero balance (₹0.00)');
    });

    it('caps coupon discount to customer charges without creating negative charges', () => {
      const result = calculateOrderValuation([
        {
          categoryId: 'scrap',
          categoryName: 'Paper',
          type: 'RECYCLABLE_BUY',
          pricePerKg: 15,
          weightKg: 10, // ₹150
        },
      ], 49, 100); // Base charge is ₹49, customer applied ₹100 coupon

      // Customer charges: 0 waste + 49 base = 49. Discount cannot exceed 49.
      assert.equal(result.totalRecyclableValue, 150);
      assert.equal(result.basePickupCharge, 49);
      assert.equal(result.discountAmount, 49);
      assert.equal(result.netBalance, 150);
      assert.equal(result.netAmount, 150);
      assert.equal(result.financialDirection, 'JUNKITOUT_PAYS');
    });

    it('eliminates cumulative decimal precision drift across many fractional items', () => {
      const fractionalItems = [
        { categoryId: 'c1', type: 'RECYCLABLE_BUY', pricePerKg: 14.33, weightKg: 3.33 },
        { categoryId: 'c2', type: 'RECYCLABLE_BUY', pricePerKg: 27.89, weightKg: 1.15 },
        { categoryId: 'c3', type: 'WASTE_CHARGE', pricePerKg: 18.75, weightKg: 2.45 },
      ];

      const result = calculateOrderValuation(fractionalItems, 49.50);
      // c1: 3.33 * 14.33 = 47.7189 -> 47.72 (4772 paise)
      // c2: 1.15 * 27.89 = 32.0735 -> 32.07 (3207 paise)
      // totalRecyclableValuePaise = 7979 -> ₹79.79
      // c3: 2.45 * 18.75 = 45.9375 -> 45.94 (4594 paise)
      // basePickup: 49.50 -> 4950 paise
      // totalCustomerChargesPaise = 4594 + 4950 = 9544 paise -> ₹95.44
      // netBalancePaise = 7979 - 9544 = -1565 paise -> -₹15.65
      assert.equal(result.totalRecyclableValue, 79.79);
      assert.equal(result.totalWasteCharge, 45.94);
      assert.equal(result.totalCustomerCharges, 95.44);
      assert.equal(result.netBalance, -15.65);
      assert.equal(result.netAmount, 15.65);
      assert.equal(result.financialDirection, 'CUSTOMER_PAYS');
    });
  });

  describe('calculateValuationAdjustment', () => {
    it('Scenario A: Final valuation exactly matches upfront customer payment', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 5 }, // 100
      ], 50); // 150 total CUSTOMER_PAYS

      const adj = calculateValuationAdjustment(150, finalValuation);
      assert.equal(adj.adjustmentType, 'NO_ADJUSTMENT');
      assert.equal(adj.refundAmount, 0);
      assert.equal(adj.balanceDue, 0);
    });

    it('Scenario B: Final charges exceed upfront payment (Customer underpaid)', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 10 }, // 200
      ], 50); // 250 total CUSTOMER_PAYS

      const adj = calculateValuationAdjustment(150, finalValuation);
      assert.equal(adj.adjustmentType, 'ADDITIONAL_PAYMENT_REQUIRED');
      assert.equal(adj.balanceDue, 100);
      assert.equal(adj.refundAmount, 0);
    });

    it('Scenario C: Final charges are less than upfront payment (Customer overpaid -> Partial Refund)', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 3 }, // 60
      ], 50); // 110 total CUSTOMER_PAYS

      const adj = calculateValuationAdjustment(150, finalValuation);
      assert.equal(adj.adjustmentType, 'PARTIAL_REFUND');
      assert.equal(adj.refundAmount, 40);
      assert.equal(adj.balanceDue, 0);
    });

    it('Scenario D: Upfront was CUSTOMER_PAYS, but doorstep weighing reveals JUNKITOUT_PAYS (Full Refund + Settlement)', () => {
      // Customer paid ₹150 upfront estimated.
      // Doorstep weighing: actual waste was minimal, actual metal scrap was 20kg at ₹30 = ₹600.
      // Final net balance: ₹500 JUNKITOUT_PAYS.
      const finalValuation = calculateOrderValuation([
        { categoryId: 'm1', type: 'RECYCLABLE_BUY', pricePerKg: 30, weightKg: 20 }, // 600
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 10, weightKg: 5 }, // 50
      ], 50); // Customer charges = 100. Scrap = 600. Net = 500 JUNKITOUT_PAYS.

      const adj = calculateValuationAdjustment(150, finalValuation);
      assert.equal(adj.adjustmentType, 'FULL_REFUND_AND_SETTLEMENT');
      assert.equal(adj.refundAmount, 150);
      assert.equal(adj.settlementAmount, 500);
      assert.equal(adj.balanceDue, 0);
    });

    it('Scenario E: Doorstep weighing results in ZERO_BALANCE when upfront was paid', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'm1', type: 'RECYCLABLE_BUY', pricePerKg: 20, weightKg: 5 }, // 100
      ], 100); // Net 0

      const adj = calculateValuationAdjustment(100, finalValuation);
      assert.equal(adj.adjustmentType, 'ZERO_BALANCE_REFUND');
      assert.equal(adj.refundAmount, 100);
      assert.equal(adj.settlementAmount, 0);
    });
  });

  describe('Total Payable Calculation Invariants (Fixed ₹50 Service Charge)', () => {
    it('₹41 waste -> ₹50 service charge -> ₹91 total payable', () => {
      const total = calculateBookingTotalPayable(41.0, 50.0, 0.0);
      assert.equal(total, 91.0);
      assert.equal(toPaise(total), 9100);
    });

    it('₹100 waste -> ₹50 service charge -> ₹150 total payable', () => {
      const total = calculateBookingTotalPayable(100.0, 50.0, 0.0);
      assert.equal(total, 150.0);
      assert.equal(toPaise(total), 15000);
    });

    it('₹250 waste -> ₹50 service charge -> ₹300 total payable', () => {
      const total = calculateBookingTotalPayable(250.0, 50.0, 0.0);
      assert.equal(total, 300.0);
      assert.equal(toPaise(total), 30000);
    });

    it('₹500 waste -> ₹50 service charge -> ₹550 total payable', () => {
      const total = calculateBookingTotalPayable(500.0, 50.0, 0.0);
      assert.equal(total, 550.0);
      assert.equal(toPaise(total), 55000);
    });

    it('adding more waste increases total waste value and total payable proportionally', () => {
      const initialWaste = 41.0;
      const initialTotal = calculateBookingTotalPayable(initialWaste, 50.0, 0.0);
      assert.equal(initialTotal, 91.0);

      const addedWaste = 70.0;
      const updatedWaste = initialWaste + addedWaste;
      const updatedTotal = calculateBookingTotalPayable(updatedWaste, 50.0, 0.0);
      assert.equal(updatedWaste, 111.0);
      assert.equal(updatedTotal, 161.0);
      assert.equal(updatedTotal - initialTotal, addedWaste, 'Payable must increase by exactly the added waste amount');
    });

    it('service charge remains strictly ₹50 after changing waste quantity and category', () => {
      const fixedServiceCharge = 50.0;
      const cartVariations = [
        [{ categoryId: 'paper', rate: 14, weight: 1 }],
        [{ categoryId: 'paper', rate: 14, weight: 5 }],
        [{ categoryId: 'plastic', rate: 18, weight: 10 }],
        [{ categoryId: 'ewaste', rate: 25, weight: 10 }, { categoryId: 'metal', rate: 30, weight: 5 }],
      ];

      for (const cart of cartVariations) {
        const wasteVal = cart.reduce((sum, item) => sum + item.rate * item.weight, 0);
        const payable = calculateBookingTotalPayable(wasteVal, fixedServiceCharge, 0);
        assert.equal(payable, wasteVal + 50.0, 'Payable must equal waste value plus strictly ₹50 fee');
      }
    });

    it('preserves separate bulky / non-recyclable disposal charges on top of ₹50 service charge', () => {
      const payable = calculateBookingTotalPayable(41.0, 50.0, 25.0);
      assert.equal(payable, 116.0);
      assert.equal(toPaise(payable), 11600);
    });
  });

  describe('calculateMaterialItemAmount (Special Pricing Rule for Individual Materials)', () => {
    it('applies standard per-kg pricing when quantity is below or equal to 7 kg', () => {
      // 4 kg at ₹3/kg = ₹12
      const res4 = calculateMaterialItemAmount(4, 3);
      assert.equal(res4.materialAmount, 12);
      assert.equal(res4.materialAmountPaise, 1200);
      assert.equal(res4.isOfferApplied, false);

      // Exactly 7 kg at ₹14/kg = ₹98
      const res7 = calculateMaterialItemAmount(7, 14);
      assert.equal(res7.materialAmount, 98);
      assert.equal(res7.materialAmountPaise, 9800);
      assert.equal(res7.isOfferApplied, false);

      // 1 kg at ₹20/kg = ₹20
      const res1 = calculateMaterialItemAmount(1, 20);
      assert.equal(res1.materialAmount, 20);
      assert.equal(res1.isOfferApplied, false);
    });

    it('applies ₹99 special offer price individually when quantity exceeds 7 kg', () => {
      // 7.1 kg at ₹14/kg -> ₹99
      const res71 = calculateMaterialItemAmount(7.1, 14);
      assert.equal(res71.materialAmount, 99);
      assert.equal(res71.materialAmountPaise, 9900);
      assert.equal(res71.isOfferApplied, true);

      // 8 kg at ₹14/kg -> ₹99
      const res8 = calculateMaterialItemAmount(8, 14);
      assert.equal(res8.materialAmount, 99);
      assert.equal(res8.materialAmountPaise, 9900);
      assert.equal(res8.isOfferApplied, true);

      // 10 kg at ₹18/kg -> ₹99
      const res10 = calculateMaterialItemAmount(10, 18);
      assert.equal(res10.materialAmount, 99);
      assert.equal(res10.materialAmountPaise, 9900);
      assert.equal(res10.isOfferApplied, true);

      // 25 kg at ₹50/kg -> ₹99
      const res25 = calculateMaterialItemAmount(25, 50);
      assert.equal(res25.materialAmount, 99);
      assert.equal(res25.materialAmountPaise, 9900);
      assert.equal(res25.isOfferApplied, true);
    });

    it('supports configurable threshold and offer price', () => {
      // Custom threshold of 5 kg and offer price of ₹79
      const belowCustom = calculateMaterialItemAmount(4, 20, 5, 79);
      assert.equal(belowCustom.materialAmount, 80);
      assert.equal(belowCustom.isOfferApplied, false);

      const aboveCustom = calculateMaterialItemAmount(6, 20, 5, 79);
      assert.equal(aboveCustom.materialAmount, 79);
      assert.equal(aboveCustom.isOfferApplied, true);
    });

    it('handles zero, negative, or invalid weight gracefully', () => {
      assert.equal(calculateMaterialItemAmount(0, 10).materialAmount, 0);
      assert.equal(calculateMaterialItemAmount(-5, 10).materialAmount, 0);
      assert.equal(calculateMaterialItemAmount(NaN, 10).materialAmount, 0);
    });
  });

  describe('calculatePickupSummary (Customer Pickup Summary, Waived Service Charge & Special Pricing)', () => {
    it('calculates single material under 7 kg with waived service charge: ₹3/kg × 4 kg = ₹12 + ₹0 service charge = ₹12', () => {
      const summary = calculatePickupSummary([
        {
          categoryId: 'mat-1',
          categoryName: 'E-Waste',
          pricePerKg: 3,
          weightKg: 4,
        },
      ]);

      assert.equal(summary.materialCount, 1);
      assert.equal(summary.totalWeightKg, 4);
      assert.equal(summary.items[0].materialAmount, 12);
      assert.equal(summary.items[0].isOfferApplied, false);
      assert.equal(summary.pickupValue, 12);
      assert.equal(summary.originalServiceCharge, 50);
      assert.equal(summary.serviceCharge, 0);
      assert.equal(summary.isServiceChargeWaived, true);
      assert.equal(summary.totalAmountPayable, 12);
      assert.equal(summary.totalAmountPayablePaise, 1200);
    });

    it('applies ₹99 offer price for material exceeding 7 kg in pickup summary with waived service charge', () => {
      const summary = calculatePickupSummary([
        {
          categoryId: 'paper',
          categoryName: 'Paper & Cardboard',
          pricePerKg: 14,
          weightKg: 8,
        },
      ]);

      assert.equal(summary.materialCount, 1);
      assert.equal(summary.totalWeightKg, 8);
      assert.equal(summary.items[0].materialAmount, 99);
      assert.equal(summary.items[0].isOfferApplied, true);
      assert.equal(summary.pickupValue, 99);
      assert.equal(summary.serviceCharge, 0);
      assert.equal(summary.isServiceChargeWaived, true);
      assert.equal(summary.totalAmountPayable, 99);
      assert.equal(summary.totalAmountPayablePaise, 9900);
    });

    it('calculates multiple materials where some exceed 7 kg and others do not', () => {
      const summary = calculatePickupSummary([
        { categoryId: 'ewaste', categoryName: 'E-Waste', pricePerKg: 1, weightKg: 5 },           // ₹5 (<= 7 kg)
        { categoryId: 'household', categoryName: 'Household Dry Waste', pricePerKg: 8, weightKg: 3 }, // ₹24 (<= 7 kg)
        { categoryId: 'paper', categoryName: 'Paper & Cardboard', pricePerKg: 14, weightKg: 8 },      // ₹99 (> 7 kg offer)
        { categoryId: 'plastic', categoryName: 'Plastic Waste', pricePerKg: 18, weightKg: 10 },       // ₹99 (> 7 kg offer)
      ]);

      // Pickup Value = 5 + 24 + 99 + 99 = ₹227
      // Total Weight = 5 + 3 + 8 + 10 = 26 kg
      // Service Charge = ₹0 (waived)
      // Total Amount Payable = 227 + 0 = ₹227
      assert.equal(summary.materialCount, 4);
      assert.equal(summary.totalWeightKg, 26);
      assert.equal(summary.pickupValue, 227);
      assert.equal(summary.originalServiceCharge, ORIGINAL_PICKUP_SERVICE_CHARGE);
      assert.equal(summary.serviceCharge, PICKUP_SERVICE_CHARGE);
      assert.equal(summary.isServiceChargeWaived, true);
      assert.equal(summary.totalAmountPayable, 227);
      assert.equal(summary.totalAmountPayablePaise, 22700);

      // Verify individual items
      assert.equal(summary.items[0].materialAmount, 5);
      assert.equal(summary.items[0].isOfferApplied, false);
      assert.equal(summary.items[1].materialAmount, 24);
      assert.equal(summary.items[1].isOfferApplied, false);
      assert.equal(summary.items[2].materialAmount, 99);
      assert.equal(summary.items[2].isOfferApplied, true);
      assert.equal(summary.items[3].materialAmount, 99);
      assert.equal(summary.items[3].isOfferApplied, true);
    });

    it('updates totals immediately when quantities cross the 7 kg threshold', () => {
      // 6 kg at ₹14/kg = ₹84
      const at6kg = calculatePickupSummary([
        { categoryId: 'paper', categoryName: 'Paper & Cardboard', pricePerKg: 14, weightKg: 6 },
      ]);
      assert.equal(at6kg.pickupValue, 84);
      assert.equal(at6kg.totalAmountPayable, 84);
      assert.equal(at6kg.items[0].isOfferApplied, false);

      // 7 kg at ₹14/kg = ₹98
      const at7kg = calculatePickupSummary([
        { categoryId: 'paper', categoryName: 'Paper & Cardboard', pricePerKg: 14, weightKg: 7 },
      ]);
      assert.equal(at7kg.pickupValue, 98);
      assert.equal(at7kg.totalAmountPayable, 98);
      assert.equal(at7kg.items[0].isOfferApplied, false);

      // 8 kg at ₹14/kg -> ₹99 offer price applied
      const at8kg = calculatePickupSummary([
        { categoryId: 'paper', categoryName: 'Paper & Cardboard', pricePerKg: 14, weightKg: 8 },
      ]);
      assert.equal(at8kg.totalWeightKg, 8);
      assert.equal(at8kg.pickupValue, 99);
      assert.equal(at8kg.totalAmountPayable, 99);
      assert.equal(at8kg.items[0].isOfferApplied, true);
    });

    it('filters out zero, negative, or invalid weights safely', () => {
      const summary = calculatePickupSummary([
        { categoryId: 'zero', categoryName: 'Zero', pricePerKg: 10, weightKg: 0 },
        { categoryId: 'neg', categoryName: 'Negative', pricePerKg: 10, weightKg: -3 },
        { categoryId: 'nan', categoryName: 'NaN', pricePerKg: 10, weightKg: Number.NaN },
        { categoryId: 'valid', categoryName: 'Plastic Waste', pricePerKg: 18, weightKg: 2 }, // ₹36
      ]);

      assert.equal(summary.materialCount, 1);
      assert.equal(summary.totalWeightKg, 2);
      assert.equal(summary.pickupValue, 36);
      assert.equal(summary.serviceCharge, 0);
      assert.equal(summary.isServiceChargeWaived, true);
      assert.equal(summary.totalAmountPayable, 36);
    });

    it('honors explicitly passed non-zero service charge if requested', () => {
      const summary = calculatePickupSummary(
        [{ categoryId: 'plastic', categoryName: 'Plastic', pricePerKg: 18, weightKg: 2 }],
        50.0
      );
      assert.equal(summary.serviceCharge, 50.0);
      assert.equal(summary.isServiceChargeWaived, false);
      assert.equal(summary.totalAmountPayable, 86.0);
    });
  });
});
