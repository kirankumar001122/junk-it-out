import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import {
  calculateOrderValuation,
  calculateValuationAdjustment,
  toPaise,
  toRupees,
} from '../lib/pricing';
import {
  calculateRefundTotals,
  canApplyRefundStatus,
  refundAttemptId,
  refundEventId,
  refundIdempotencyKey,
  refundStatusFromProviderStatus,
} from '../lib/payments/refundWorkflow';

describe('Comprehensive Financial Correctness & Business Rules', () => {
  // --------------------------------------------------------------------------
  // 1. Normal Payment & Dual Direction Valuation
  // --------------------------------------------------------------------------
  describe('1. Pricing Engine & Financial Direction Determination', () => {
    it('Scenario 1: Pure recyclable scrap booking results in JUNKITOUT_PAYS (customer payout)', () => {
      const items = [
        { categoryId: 'paper', type: 'RECYCLABLE_BUY', pricePerKg: 15, weightKg: 20 }, // ₹300
        { categoryId: 'metal', type: 'RECYCLABLE_BUY', pricePerKg: 35, weightKg: 10 }, // ₹350
      ];
      const basePickupCharge = 69.0;
      const result = calculateOrderValuation(items, basePickupCharge, 0.0);

      assert.equal(result.totalRecyclableValue, 650.0);
      assert.equal(result.totalWasteCharge, 0.0);
      assert.equal(result.basePickupCharge, 69.0);
      assert.equal(result.totalCustomerCharges, 69.0);
      assert.equal(result.netBalance, 581.0);
      assert.equal(result.netAmount, 581.0);
      assert.equal(result.financialDirection, 'JUNKITOUT_PAYS');
      assert.equal(result.summaryLabel, 'Junk It Out pays ₹581.00');
    });

    it('Scenario 2: Heavy bulky waste booking results in CUSTOMER_PAYS (customer pays Junk It Out)', () => {
      const items = [
        { categoryId: 'furniture', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 30 }, // ₹600
      ];
      const basePickupCharge = 69.0;
      const result = calculateOrderValuation(items, basePickupCharge, 0.0);

      assert.equal(result.totalRecyclableValue, 0.0);
      assert.equal(result.totalWasteCharge, 600.0);
      assert.equal(result.basePickupCharge, 69.0);
      assert.equal(result.totalCustomerCharges, 669.0);
      assert.equal(result.netBalance, -669.0);
      assert.equal(result.netAmount, 669.0);
      assert.equal(result.financialDirection, 'CUSTOMER_PAYS');
      assert.equal(result.summaryLabel, 'Customer pays ₹669.00');
    });

    it('Scenario 3: Mixed booking where recyclable scrap offsets waste and pickup charge', () => {
      const items = [
        { categoryId: 'copper', type: 'RECYCLABLE_BUY', pricePerKg: 400, weightKg: 2 }, // ₹800
        { categoryId: 'debris', type: 'WASTE_CHARGE', pricePerKg: 10, weightKg: 25 },   // ₹250
      ];
      const basePickupCharge = 69.0;
      const couponDiscount = 50.0;
      const result = calculateOrderValuation(items, basePickupCharge, couponDiscount);

      // Customer charges: 250 (waste) + 69 (pickup) = 319 gross charges
      // Coupon discount: 50
      // Net customer charges: 319 - 50 = 269
      // Scrap value: 800
      // Net balance: 800 - 269 = +531
      assert.equal(result.totalRecyclableValue, 800.0);
      assert.equal(result.totalWasteCharge, 250.0);
      assert.equal(result.basePickupCharge, 69.0);
      assert.equal(result.discountAmount, 50.0);
      assert.equal(result.netBalance, 531.0);
      assert.equal(result.netAmount, 531.0);
      assert.equal(result.financialDirection, 'JUNKITOUT_PAYS');
    });

    it('Scenario 4: Mixed booking where waste charges exceed recyclable scrap', () => {
      const items = [
        { categoryId: 'paper', type: 'RECYCLABLE_BUY', pricePerKg: 10, weightKg: 5 },    // ₹50
        { categoryId: 'furniture', type: 'WASTE_CHARGE', pricePerKg: 15, weightKg: 20 }, // ₹300
      ];
      const basePickupCharge = 49.0;
      const result = calculateOrderValuation(items, basePickupCharge, 0.0);

      // Customer charges: 300 + 49 = 349
      // Scrap value: 50
      // Net balance: 50 - 349 = -299
      assert.equal(result.totalRecyclableValue, 50.0);
      assert.equal(result.totalWasteCharge, 300.0);
      assert.equal(result.netBalance, -299.0);
      assert.equal(result.netAmount, 299.0);
      assert.equal(result.financialDirection, 'CUSTOMER_PAYS');
    });

    it('Scenario 5: Zero balance when recyclable scrap exactly balances charges', () => {
      const items = [
        { categoryId: 'plastic', type: 'RECYCLABLE_BUY', pricePerKg: 20, weightKg: 5 }, // ₹100
        { categoryId: 'rubble', type: 'WASTE_CHARGE', pricePerKg: 10, weightKg: 5 },   // ₹50
      ];
      const basePickupCharge = 50.0; // 50 + 50 = ₹100
      const result = calculateOrderValuation(items, basePickupCharge, 0.0);

      assert.equal(result.netBalance, 0.0);
      assert.equal(result.netAmount, 0.0);
      assert.equal(result.financialDirection, 'ZERO_BALANCE');
      assert.equal(result.summaryLabel, 'Zero balance (₹0.00)');
    });
  });

  // --------------------------------------------------------------------------
  // 2. Estimated vs Final Doorstep Valuation Adjustments (Scenarios A - E)
  // --------------------------------------------------------------------------
  describe('2. Estimated vs Final Doorstep Valuation Adjustments', () => {
    it('Scenario A (Equal valuation): Doorstep scale weights match estimate', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 10 }, // 200
      ], 50); // Net 250 CUSTOMER_PAYS

      const adj = calculateValuationAdjustment(250, finalValuation);
      assert.equal(adj.adjustmentType, 'NO_ADJUSTMENT');
      assert.equal(adj.refundAmount, 0);
      assert.equal(adj.balanceDue, 0);
      assert.equal(adj.finalPayableAmount, 250);
    });

    it('Scenario B (Higher final charge): Customer underpaid estimated charge', () => {
      // Estimated: 10kg furniture = ₹200 + ₹50 = ₹250 paid upfront
      // Actual weighed: 15kg furniture = ₹300 + ₹50 = ₹350
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 15 },
      ], 50);

      const adj = calculateValuationAdjustment(250, finalValuation);
      assert.equal(adj.adjustmentType, 'ADDITIONAL_PAYMENT_REQUIRED');
      assert.equal(adj.balanceDue, 100);
      assert.equal(adj.refundAmount, 0);
      assert.equal(adj.originalPaidAmount, 250);
      assert.equal(adj.finalPayableAmount, 350);
    });

    it('Scenario C (Lower final charge): Customer overpaid estimated charge -> Partial Refund', () => {
      // Estimated: 15kg furniture = ₹300 + ₹50 = ₹350 paid upfront
      // Actual weighed: 8kg furniture = ₹160 + ₹50 = ₹210
      const finalValuation = calculateOrderValuation([
        { categoryId: 'w1', type: 'WASTE_CHARGE', pricePerKg: 20, weightKg: 8 },
      ], 50);

      const adj = calculateValuationAdjustment(350, finalValuation);
      assert.equal(adj.adjustmentType, 'PARTIAL_REFUND');
      assert.equal(adj.refundAmount, 140);
      assert.equal(adj.balanceDue, 0);
      assert.equal(adj.originalPaidAmount, 350);
      assert.equal(adj.finalPayableAmount, 210);
    });

    it('Scenario D (Direction Flip): Customer paid upfront, but actual scrap flips to JUNKITOUT_PAYS', () => {
      // Customer paid ₹200 upfront estimated.
      // Doorstep weighing: actual scrap metal was 25kg at ₹30 = ₹750. Pickup = ₹50.
      // Final net balance = ₹700 Junk It Out pays customer.
      const finalValuation = calculateOrderValuation([
        { categoryId: 'metal', type: 'RECYCLABLE_BUY', pricePerKg: 30, weightKg: 25 },
      ], 50);

      const adj = calculateValuationAdjustment(200, finalValuation);
      assert.equal(adj.adjustmentType, 'FULL_REFUND_AND_SETTLEMENT');
      assert.equal(adj.refundAmount, 200); // 100% refund of upfront payment
      assert.equal(adj.settlementAmount, 700); // Scrap payout to customer
      assert.equal(adj.balanceDue, 0);
    });

    it('Scenario E (Zero Balance with Upfront Payment): Full upfront refund', () => {
      const finalValuation = calculateOrderValuation([
        { categoryId: 'scrap', type: 'RECYCLABLE_BUY', pricePerKg: 20, weightKg: 5 }, // 100
      ], 100); // Net 0

      const adj = calculateValuationAdjustment(100, finalValuation);
      assert.equal(adj.adjustmentType, 'ZERO_BALANCE_REFUND');
      assert.equal(adj.refundAmount, 100);
      assert.equal(adj.settlementAmount, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Decimal Safety & Float Precision
  // --------------------------------------------------------------------------
  describe('3. Decimal Safety & Elimination of Floating Point Drift', () => {
    it('eliminates 0.1 + 0.2 floating point inaccuracies in currency conversions', () => {
      const sum = 0.1 + 0.2; // In raw JS, sum = 0.30000000000000004
      assert.notEqual(sum, 0.3);

      const paise = toPaise(sum);
      assert.equal(paise, 30);
      assert.equal(toRupees(paise), 0.3);
    });

    it('handles fractional weights with non-integer rates cleanly', () => {
      const items = [
        { categoryId: 'i1', type: 'RECYCLABLE_BUY', pricePerKg: 13.75, weightKg: 4.33 },
        { categoryId: 'i2', type: 'WASTE_CHARGE', pricePerKg: 22.40, weightKg: 1.85 },
      ];
      const result = calculateOrderValuation(items, 49.0);

      // i1: 4.33 * 13.75 = 59.5375 -> 5954 paise (₹59.54)
      // i2: 1.85 * 22.40 = 41.4400 -> 4144 paise (₹41.44)
      // base: 49.00 -> 4900 paise
      // charges: 4144 + 4900 = 9044 paise (₹90.44)
      // netBalance: 5954 - 9044 = -3090 paise (-₹30.90)
      assert.equal(result.totalRecyclableValue, 59.54);
      assert.equal(result.totalWasteCharge, 41.44);
      assert.equal(result.totalCustomerCharges, 90.44);
      assert.equal(result.netBalance, -30.90);
      assert.equal(result.netAmount, 30.90);
      assert.equal(result.financialDirection, 'CUSTOMER_PAYS');
    });
  });

  // --------------------------------------------------------------------------
  // 4. Payment Creation & Verification Idempotency Keys
  // --------------------------------------------------------------------------
  describe('4. Idempotency Keys & Hash Generation', () => {
    it('generates consistent deterministic refund idempotency keys', () => {
      const paymentId = 'pay_test_12345';
      const key1 = refundIdempotencyKey(paymentId);
      const key2 = refundIdempotencyKey(paymentId);
      assert.equal(key1, key2);
      assert.match(key1, /^jio_refund_[a-f0-9]{64}$/);

      const customKey = refundIdempotencyKey(paymentId, 'partial_refund_1');
      assert.notEqual(key1, customKey);
      assert.match(customKey, /^jio_refund_[a-f0-9]{64}$/);
    });

    it('generates deterministic refund attempt identifiers', () => {
      const paymentId = 'pay_test_12345';
      const id1 = refundAttemptId(paymentId);
      const id2 = refundAttemptId(paymentId);
      assert.equal(id1, id2);
      assert.match(id1, /^refund_attempt_[a-f0-9]{64}$/);
    });

    it('generates stable event primary keys for webhook duplicate deduplication', () => {
      const attemptId = 'refund_attempt_abc';
      const eventId1 = refundEventId(attemptId, 'event_rzp_999');
      const eventId2 = refundEventId(attemptId, 'event_rzp_999');
      assert.equal(eventId1, eventId2);
      assert.match(eventId1, /^refund_event_[a-f0-9]{64}$/);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Webhook Events & State Transitions
  // --------------------------------------------------------------------------
  describe('5. Webhook State Machine & Event Resolution', () => {
    it('correctly maps provider refund status to local status', () => {
      assert.equal(refundStatusFromProviderStatus('processed'), 'REFUNDED');
      assert.equal(refundStatusFromProviderStatus('pending'), 'REFUND_PENDING');
      assert.equal(refundStatusFromProviderStatus('failed'), 'REFUND_FAILED');
      assert.equal(refundStatusFromProviderStatus('unknown_status'), null);
    });

    it('enforces terminal status protection: processed refund cannot be overwritten', () => {
      assert.equal(canApplyRefundStatus('REFUNDED', 'REFUNDED'), true);
      assert.equal(canApplyRefundStatus('REFUNDED', 'REFUND_FAILED'), false);
      assert.equal(canApplyRefundStatus('REFUNDED', 'PENDING'), false);
    });

    it('allows failed refunds to recover to processed when provider evidence arrives', () => {
      assert.equal(canApplyRefundStatus('REFUND_FAILED', 'REFUNDED'), true);
      assert.equal(canApplyRefundStatus('REFUND_FAILED', 'PARTIALLY_REFUNDED'), true);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Refund Totals Calculation (Full & Partial Refunds)
  // --------------------------------------------------------------------------
  describe('6. Refund Totals & Partial Refund Calculation', () => {
    it('accurately calculates settled, in-flight, and remaining refund amounts', () => {
      const paymentAmount = 500.0; // ₹500 paid
      const attempts = [
        { id: 'att-1', amount: 150.0, status: 'REFUNDED' }, // ₹150 refunded
        { id: 'att-2', amount: 100.0, status: 'REFUND_PROCESSING' }, // ₹100 in-flight
        { id: 'att-3', amount: 50.0, status: 'REFUND_FAILED' }, // ₹50 failed
      ];

      const totals = calculateRefundTotals(paymentAmount, attempts);
      assert.equal(totals.totalPaise, 50000);
      assert.equal(totals.settledPaise, 15000);
      assert.equal(totals.inFlightPaise, 10000);
      assert.equal(totals.remainingPaise, 35000); // 500 - 150 = 350
      assert.equal(totals.availablePaise, 25000); // 500 - 150 - 100 = 250

      assert.equal(totals.settledAmount, 150.0);
      assert.equal(totals.inFlightAmount, 100.0);
      assert.equal(totals.remainingAmount, 350.0);
      assert.equal(totals.availableAmount, 250.0);
    });

    it('prevents refunds when available amount is zero', () => {
      const paymentAmount = 200.0;
      const attempts = [
        { id: 'att-1', amount: 200.0, status: 'REFUNDED' },
      ];
      const totals = calculateRefundTotals(paymentAmount, attempts);
      assert.equal(totals.remainingPaise, 0);
      assert.equal(totals.availablePaise, 0);
      assert.equal(totals.remainingAmount, 0);
      assert.equal(totals.availableAmount, 0);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Settlement State Progression & Admin Approvals
  // --------------------------------------------------------------------------
  describe('7. Settlement State Transitions', () => {
    const validTransitions: Record<string, string[]> = {
      PENDING: ['APPROVED'],
      APPROVED: ['READY_FOR_PAYOUT'],
      READY_FOR_PAYOUT: ['PROCESSING', 'PAID', 'FAILED'],
      PROCESSING: ['PAID', 'FAILED'],
      FAILED: ['READY_FOR_PAYOUT'],
      PAID: [], // Terminal
      SETTLEMENT_COMPLETED: [], // Terminal
    };

    function canTransitionSettlement(current: string, next: string): boolean {
      if (current === 'PAID' || current === 'SETTLEMENT_COMPLETED') return false;
      return validTransitions[current]?.includes(next) ?? false;
    }

    it('allows valid settlement progression from PENDING to PAID', () => {
      assert.equal(canTransitionSettlement('PENDING', 'APPROVED'), true);
      assert.equal(canTransitionSettlement('APPROVED', 'READY_FOR_PAYOUT'), true);
      assert.equal(canTransitionSettlement('READY_FOR_PAYOUT', 'PROCESSING'), true);
      assert.equal(canTransitionSettlement('PROCESSING', 'PAID'), true);
    });

    it('prevents modification once settlement reaches PAID terminal state', () => {
      assert.equal(canTransitionSettlement('PAID', 'PENDING'), false);
      assert.equal(canTransitionSettlement('PAID', 'APPROVED'), false);
      assert.equal(canTransitionSettlement('PAID', 'PROCESSING'), false);
      assert.equal(canTransitionSettlement('PAID', 'FAILED'), false);
    });

    it('allows retry from FAILED back to READY_FOR_PAYOUT', () => {
      assert.equal(canTransitionSettlement('FAILED', 'READY_FOR_PAYOUT'), true);
    });
  });
});
