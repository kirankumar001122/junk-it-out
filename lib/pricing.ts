/**
 * Price Calculation Engine for Junk It Out
 */

export interface CalculationItemInput {
  categoryId: string;
  categoryName: string;
  type: string; // 'RECYCLABLE_BUY' (we pay customer) or 'WASTE_CHARGE' (customer pays us)
  pricePerKg: number;
  weightKg: number;
}

export interface CalculationResult {
  items: {
    categoryId: string;
    categoryName: string;
    type: string;
    weightKg: number;
    ratePerKg: number;
    subtotal: number;
  }[];
  totalRecyclableValue: number; // Value of scrap we pay to customer
  totalWasteCharge: number;     // Charge customer pays us for heavy waste
  basePickupCharge: number;
  discountAmount: number;
  netAmount: number;            // Final absolute balance
  financialDirection: 'JUNKITOUT_PAYS' | 'CUSTOMER_PAYS'; // Who pays whom
  summaryLabel: string;
}

export function calculateOrderValuation(
  itemsInput: CalculationItemInput[],
  basePickupCharge: number = 69.0,
  couponDiscount: number = 0.0
): CalculationResult {
  let totalRecyclableValue = 0;
  let totalWasteCharge = 0;

  const itemResults = itemsInput.map((item) => {
    const subtotal = item.weightKg * item.pricePerKg;
    if (item.type === 'WASTE_CHARGE') {
      totalWasteCharge += subtotal;
    } else {
      totalRecyclableValue += subtotal;
    }

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      type: item.type,
      weightKg: item.weightKg,
      ratePerKg: item.pricePerKg,
      subtotal: Math.round(subtotal * 100) / 100,
    };
  });

  const netBalance = totalRecyclableValue - totalWasteCharge - basePickupCharge + couponDiscount;
  const netAmount = Math.max(0, Math.round(Math.abs(netBalance) * 100) / 100);
  const financialDirection = netBalance >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS';
  const summaryLabel = financialDirection === 'JUNKITOUT_PAYS'
    ? `Junk It Out pays ₹${netAmount.toFixed(2)}`
    : `Customer pays ₹${netAmount.toFixed(2)}`;

  return {
    items: itemResults,
    totalRecyclableValue: Math.round(totalRecyclableValue * 100) / 100,
    totalWasteCharge: Math.round(totalWasteCharge * 100) / 100,
    basePickupCharge,
    discountAmount: couponDiscount,
    netAmount,
    financialDirection,
    summaryLabel,
  };
}
