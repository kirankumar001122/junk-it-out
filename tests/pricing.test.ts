import assert from 'node:assert/strict';
import { describe, it } from 'vitest';
import { calculateOrderValuation } from '../lib/pricing';

describe('order valuation', () => {
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
    assert.equal(result.netAmount, 120);
    assert.equal(result.financialDirection, 'JUNKITOUT_PAYS');
  });
});
