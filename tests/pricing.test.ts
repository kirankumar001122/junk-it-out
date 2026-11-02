import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  calculateOrderValuation,
  calculateValuationAdjustment,
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
});
