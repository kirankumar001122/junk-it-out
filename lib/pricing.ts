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
  let totalWasteItemsValue = 0;

  const itemResults = itemsInput.map((item) => {
    const subtotal = item.weightKg * item.pricePerKg;
    totalWasteItemsValue += subtotal;

    return {
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      type: item.type,
      weightKg: item.weightKg,
      ratePerKg: item.pricePerKg,
      subtotal: Math.round(subtotal * 100) / 100,
    };
  });

  const rawPayable = totalWasteItemsValue + basePickupCharge - couponDiscount;
  const netAmount = Math.max(1, Math.round(rawPayable * 100) / 100);
  const financialDirection: 'CUSTOMER_PAYS' = 'CUSTOMER_PAYS';
  const summaryLabel = `Customer pays ₹${netAmount.toFixed(2)}`;

  return {
    items: itemResults,
    totalRecyclableValue: Math.round(totalWasteItemsValue * 100) / 100,
    totalWasteCharge: Math.round(totalWasteItemsValue * 100) / 100,
    basePickupCharge,
    discountAmount: couponDiscount,
    netAmount,
    financialDirection,
    summaryLabel,
  };
}
