import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAuthenticatedOrderCustomerId } from '../../lib/orders/customerAssociation.ts';

test('order creation uses the authenticated user customer record', () => {
  assert.equal(
    getAuthenticatedOrderCustomerId(
      { userId: 'user-1', customerId: 'customer-1' },
      { id: 'user-1', role: 'CUSTOMER', customer: { id: 'customer-1' } }
    ),
    'customer-1'
  );
});

test('order creation rejects absent, mismatched, or non-customer profiles without phone fallback', () => {
  const auth = { userId: 'user-1', customerId: 'customer-1' };
  for (const user of [
    null,
    { id: 'different-user', role: 'CUSTOMER', customer: { id: 'customer-1' } },
    { id: 'user-1', role: 'AGENT', customer: { id: 'customer-1' } },
    { id: 'user-1', role: 'CUSTOMER', customer: { id: 'different-customer' } },
    { id: 'user-1', role: 'CUSTOMER', customer: null },
  ]) {
    assert.throws(() => getAuthenticatedOrderCustomerId(auth, user), /Authenticated customer profile/);
  }
});
