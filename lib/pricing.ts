/**
 * Authoritative Price Calculation Engine for Junk It Out
 *
 * Implements strict integer-paise financial arithmetic to eliminate
 * floating-point inaccuracies and standardizes dual financial direction:
 * - JUNKITOUT_PAYS: Recyclable scrap value exceeds customer charges (payout to customer).
 * - CUSTOMER_PAYS: Waste disposal and service charges exceed scrap value (customer pays Junk It Out).
 * - ZERO_BALANCE: Scrap value exactly equals customer charges (no money moves).
 */

export type FinancialDirection = 'JUNKITOUT_PAYS' | 'CUSTOMER_PAYS' | 'ZERO_BALANCE';

export interface CalculationItemInput {
  categoryId: string;
  categoryName?: string;
  type: string; // 'RECYCLABLE_BUY' (we pay customer) or 'WASTE_CHARGE' (customer pays us)
  pricePerKg: number;
  weightKg: number;
}

export interface PricingBreakdownItem {
  categoryId: string;
  categoryName: string;
  type: string;
  weightKg: number;
  ratePerKg: number;
  subtotal: number;
  subtotalPaise: number;
}

export interface CalculationResult {
  items: PricingBreakdownItem[];
  totalRecyclableValue: number;      // Scrap buy value Junk It Out pays to customer (₹)
  totalRecyclableValuePaise: number; // in integer paise
  totalWasteCharge: number;          // Waste disposal charges customer pays (₹)
  totalWasteChargePaise: number;     // in integer paise
  basePickupCharge: number;          // Logistics pickup charge (₹)
  basePickupChargePaise: number;     // in integer paise
  urgentSurcharge: number;           // Urgent slot surcharge (₹)
  urgentSurchargePaise: number;      // in integer paise
  discountAmount: number;            // Applied coupon discount (₹)
  discountAmountPaise: number;       // in integer paise
  totalCustomerCharges: number;      // wasteCharges + basePickupCharge + urgentSurcharge (₹)
  totalCustomerChargesPaise: number; // in integer paise
  netBalance: number;                // Signed balance in rupees (+ = JUNKITOUT_PAYS, - = CUSTOMER_PAYS, 0 = ZERO_BALANCE)
  netBalancePaise: number;           // Signed balance in integer paise
  netAmount: number;                 // Final absolute balance in rupees
  netAmountPaise: number;            // Final absolute balance in integer paise
  financialDirection: FinancialDirection;
  summaryLabel: string;
}

export type ValuationAdjustmentType =
  | 'NO_ADJUSTMENT'
  | 'PARTIAL_REFUND'
  | 'FULL_REFUND_AND_SETTLEMENT'
  | 'ADDITIONAL_PAYMENT_REQUIRED'
  | 'SETTLEMENT_PAYOUT'
  | 'ZERO_BALANCE_REFUND';

export interface ValuationAdjustmentResult {
  adjustmentType: ValuationAdjustmentType;
  originalPaidAmount: number;
  finalPayableAmount: number;
  refundAmount: number;
  settlementAmount: number;
  balanceDue: number;
  explanation: string;
}

/**
 * Convert a rupee amount to integer paise safely.
 * Eliminates floating point inaccuracies (e.g., 0.1 + 0.2, 19.99 * 100).
 */
export function toPaise(rupees: number): number {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees)) {
    return 0;
  }
  return Math.round((rupees + Number.EPSILON) * 100);
}

/**
 * Convert integer paise to rupee amount with 2 decimal places precision.
 */
export function toRupees(paise: number): number {
  if (typeof paise !== 'number' || !Number.isFinite(paise)) {
    return 0;
  }
  return Math.round(paise) / 100;
}

/**
 * Single authoritative order valuation calculation.
 *
 * @param itemsInput List of items with weights, category types, and rates per kg.
 * @param basePickupCharge Base doorstep collection charge (default: 69.0).
 * @param couponDiscount Verified coupon discount applied against customer charges (default: 0.0).
 * @param urgentSurcharge Surcharge for immediate or off-hour pickup (default: 0.0).
 */
export function calculateOrderValuation(
  itemsInput: CalculationItemInput[],
  basePickupCharge: number = 69.0,
  couponDiscount: number = 0.0,
  urgentSurcharge: number = 0.0
): CalculationResult {
  let totalRecyclableValuePaise = 0;
  let totalWasteChargePaise = 0;

  const itemResults: PricingBreakdownItem[] = itemsInput.map((item) => {
    const weight = typeof item.weightKg === 'number' && Number.isFinite(item.weightKg) && item.weightKg > 0
      ? item.weightKg
      : 0;
    const rate = typeof item.pricePerKg === 'number' && Number.isFinite(item.pricePerKg) && item.pricePerKg >= 0
      ? item.pricePerKg
      : 0;
    const subtotalPaise = Math.round((weight * rate + Number.EPSILON) * 100);

    const isWasteCharge = item.type === 'WASTE_CHARGE';
    if (isWasteCharge) {
      totalWasteChargePaise += subtotalPaise;
    } else {
      totalRecyclableValuePaise += subtotalPaise;
    }

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName || item.categoryId,
      type: item.type,
      weightKg: weight,
      ratePerKg: rate,
      subtotal: toRupees(subtotalPaise),
      subtotalPaise,
    };
  });

  const basePickupChargePaise = toPaise(Math.max(0, basePickupCharge));
  const urgentSurchargePaise = toPaise(Math.max(0, urgentSurcharge));
  const grossCustomerChargesPaise = totalWasteChargePaise + basePickupChargePaise + urgentSurchargePaise;

  // Coupon discount is applied to offset customer charges (cannot exceed total customer charges)
  const rawDiscountPaise = toPaise(Math.max(0, couponDiscount));
  const discountAmountPaise = Math.min(rawDiscountPaise, grossCustomerChargesPaise);
  const netCustomerChargesPaise = grossCustomerChargesPaise - discountAmountPaise;

  // netBalancePaise = Recyclables scrap buy value - Net customer charges
  const netBalancePaise = totalRecyclableValuePaise - netCustomerChargesPaise;

  let financialDirection: FinancialDirection;
  let netAmountPaise: number;

  if (netBalancePaise > 0) {
    financialDirection = 'JUNKITOUT_PAYS';
    netAmountPaise = netBalancePaise;
  } else if (netBalancePaise < 0) {
    financialDirection = 'CUSTOMER_PAYS';
    netAmountPaise = Math.abs(netBalancePaise);
  } else {
    financialDirection = 'ZERO_BALANCE';
    netAmountPaise = 0;
  }

  const netAmount = toRupees(netAmountPaise);

  const summaryLabel = financialDirection === 'JUNKITOUT_PAYS'
    ? `Junk It Out pays ₹${netAmount.toFixed(2)}`
    : financialDirection === 'CUSTOMER_PAYS'
    ? `Customer pays ₹${netAmount.toFixed(2)}`
    : `Zero balance (₹0.00)`;

  return {
    items: itemResults,
    totalRecyclableValue: toRupees(totalRecyclableValuePaise),
    totalRecyclableValuePaise,
    totalWasteCharge: toRupees(totalWasteChargePaise),
    totalWasteChargePaise,
    basePickupCharge: toRupees(basePickupChargePaise),
    basePickupChargePaise,
    urgentSurcharge: toRupees(urgentSurchargePaise),
    urgentSurchargePaise,
    discountAmount: toRupees(discountAmountPaise),
    discountAmountPaise,
    totalCustomerCharges: toRupees(grossCustomerChargesPaise),
    totalCustomerChargesPaise: grossCustomerChargesPaise,
    netBalance: toRupees(netBalancePaise),
    netBalancePaise,
    netAmount,
    netAmountPaise,
    financialDirection,
    summaryLabel,
  };
}

/**
 * Determine financial adjustment between an upfront customer payment and the final doorstep valuation.
 *
 * Handles:
 * - Scenario A: Final matches upfront payment (NO_ADJUSTMENT).
 * - Scenario B: Final customer charges exceed upfront payment (ADDITIONAL_PAYMENT_REQUIRED).
 * - Scenario C: Final customer charges are less than upfront payment (PARTIAL_REFUND).
 * - Scenario D: Direction flipped: customer paid upfront, but final order is JUNKITOUT_PAYS
 *               (FULL_REFUND_AND_SETTLEMENT - refund upfront capture and pay scrap settlement).
 * - Scenario E: Final valuation is ZERO_BALANCE (ZERO_BALANCE_REFUND if upfront was paid).
 */
export function calculateValuationAdjustment(
  customerPaidAmount: number,
  finalValuation: CalculationResult
): ValuationAdjustmentResult {
  const paidPaise = toPaise(Math.max(0, customerPaidAmount));
  const finalNetAmountPaise = finalValuation.netAmountPaise;
  const direction = finalValuation.financialDirection;

  if (direction === 'JUNKITOUT_PAYS') {
    if (paidPaise > 0) {
      // Customer paid upfront, but final weighed valuation is JUNKITOUT_PAYS
      return {
        adjustmentType: 'FULL_REFUND_AND_SETTLEMENT',
        originalPaidAmount: toRupees(paidPaise),
        finalPayableAmount: 0,
        refundAmount: toRupees(paidPaise),
        settlementAmount: finalValuation.netAmount,
        balanceDue: 0,
        explanation: `Customer paid ₹${toRupees(paidPaise).toFixed(2)} upfront, but actual weighing resulted in Junk It Out paying ₹${finalValuation.netAmount.toFixed(2)}. Full upfront refund of ₹${toRupees(paidPaise).toFixed(2)} plus scrap settlement of ₹${finalValuation.netAmount.toFixed(2)} required.`,
      };
    }
    return {
      adjustmentType: 'SETTLEMENT_PAYOUT',
      originalPaidAmount: 0,
      finalPayableAmount: 0,
      refundAmount: 0,
      settlementAmount: finalValuation.netAmount,
      balanceDue: 0,
      explanation: `Doorstep scrap weighing confirmed settlement payout of ₹${finalValuation.netAmount.toFixed(2)} to customer.`,
    };
  }

  if (direction === 'ZERO_BALANCE') {
    if (paidPaise > 0) {
      return {
        adjustmentType: 'ZERO_BALANCE_REFUND',
        originalPaidAmount: toRupees(paidPaise),
        finalPayableAmount: 0,
        refundAmount: toRupees(paidPaise),
        settlementAmount: 0,
        balanceDue: 0,
        explanation: `Final order balance is ₹0.00. Refund full customer upfront payment of ₹${toRupees(paidPaise).toFixed(2)}.`,
      };
    }
    return {
      adjustmentType: 'NO_ADJUSTMENT',
      originalPaidAmount: 0,
      finalPayableAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      balanceDue: 0,
      explanation: 'Final order balance is ₹0.00. No money movement required.',
    };
  }

  // Direction is CUSTOMER_PAYS
  if (paidPaise === finalNetAmountPaise) {
    return {
      adjustmentType: 'NO_ADJUSTMENT',
      originalPaidAmount: toRupees(paidPaise),
      finalPayableAmount: finalValuation.netAmount,
      refundAmount: 0,
      settlementAmount: 0,
      balanceDue: 0,
      explanation: `Final charge matches customer payment of ₹${finalValuation.netAmount.toFixed(2)}.`,
    };
  }

  if (paidPaise > finalNetAmountPaise) {
    // Customer overpaid - partial refund
    const refundPaise = paidPaise - finalNetAmountPaise;
    return {
      adjustmentType: 'PARTIAL_REFUND',
      originalPaidAmount: toRupees(paidPaise),
      finalPayableAmount: finalValuation.netAmount,
      refundAmount: toRupees(refundPaise),
      settlementAmount: 0,
      balanceDue: 0,
      explanation: `Customer paid ₹${toRupees(paidPaise).toFixed(2)}, but final charge is ₹${finalValuation.netAmount.toFixed(2)}. Partial refund of ₹${toRupees(refundPaise).toFixed(2)} due to customer.`,
    };
  }

  // Customer underpaid - additional payment needed
  const duePaise = finalNetAmountPaise - paidPaise;
  return {
    adjustmentType: 'ADDITIONAL_PAYMENT_REQUIRED',
    originalPaidAmount: toRupees(paidPaise),
    finalPayableAmount: finalValuation.netAmount,
    refundAmount: 0,
    settlementAmount: 0,
    balanceDue: toRupees(duePaise),
    explanation: `Customer paid ₹${toRupees(paidPaise).toFixed(2)}, but final charge is ₹${finalValuation.netAmount.toFixed(2)}. Balance due from customer is ₹${toRupees(duePaise).toFixed(2)}.`,
  };
}
