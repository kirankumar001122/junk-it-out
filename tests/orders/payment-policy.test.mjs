import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isOrderPaymentGateSatisfied } from '../../lib/payments/policy.ts';

test('customer tracking requires captured payment while Junk It Out pays remain accessible', () => {
  assert.equal(
    isOrderPaymentGateSatisfied({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: 'PENDING' }),
    false
  );
  assert.equal(
    isOrderPaymentGateSatisfied({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: 'AUTHORIZED' }),
    false
  );
  assert.equal(
    isOrderPaymentGateSatisfied({ financialDirection: 'CUSTOMER_PAYS', paymentStatus: 'CAPTURED' }),
    true
  );
  assert.equal(
    isOrderPaymentGateSatisfied({ financialDirection: 'JUNKITOUT_PAYS', paymentStatus: 'PENDING' }),
    true
  );
});
