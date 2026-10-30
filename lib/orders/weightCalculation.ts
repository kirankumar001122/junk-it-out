/**
 * Domain service for calculating actual item weights, subtotal charges,
 * and financial direction upon physical weigh-in and completion.
 */

export interface ActualWeightInput {
  itemId?: string;
  categoryId?: string;
  actualWeight: number;
}

export interface WeightCalculationResult {
  actualTotalRecyclable: number;
  actualTotalWasteCharge: number;
  netAmount: number;
  financialDirection: 'JUNKITOUT_PAYS' | 'CUSTOMER_PAYS';
  finalAmount: number;
  totalWeightKg: number;
  itemUpdates: Array<{ id: string; actualWeight: number; subtotal: number }>;
}

export function calculateActualWeights(
  items: Array<{
    id: string;
    categoryId: string;
    ratePerKg: number;
    category: { type: string };
  }>,
  actualWeights: ActualWeightInput[],
  pickupCharge: number = 0,
  discountAmount: number = 0
): WeightCalculationResult {
  const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  let actualTotalRecyclable = 0;
  let actualTotalWasteCharge = 0;
  const itemUpdates: Array<{ id: string; actualWeight: number; subtotal: number }> = [];

  for (const itemInput of actualWeights) {
    const dbItem = items.find(
      (i) =>
        (itemInput?.itemId && i.id === itemInput.itemId) ||
        i.categoryId === itemInput.categoryId ||
        i.id === itemInput.categoryId
    );
    if (dbItem) {
      const weightKg = itemInput.actualWeight;
      const subtotal = round2(weightKg * dbItem.ratePerKg);
      if (dbItem.category.type === 'WASTE_CHARGE') {
        actualTotalWasteCharge += subtotal;
      } else {
        actualTotalRecyclable += subtotal;
      }
      itemUpdates.push({ id: dbItem.id, actualWeight: weightKg, subtotal });
    }
  }

  const netAmount = actualTotalRecyclable - (actualTotalWasteCharge + pickupCharge - discountAmount);
  const financialDirection: 'JUNKITOUT_PAYS' | 'CUSTOMER_PAYS' =
    netAmount >= 0 ? 'JUNKITOUT_PAYS' : 'CUSTOMER_PAYS';
  const finalAmount = round2(Math.abs(netAmount));
  const totalWeightKg = actualWeights.reduce(
    (total: number, input: any) => total + (input.actualWeight || 0),
    0
  );

  return {
    actualTotalRecyclable,
    actualTotalWasteCharge,
    netAmount,
    financialDirection,
    finalAmount,
    totalWeightKg,
    itemUpdates,
  };
}

