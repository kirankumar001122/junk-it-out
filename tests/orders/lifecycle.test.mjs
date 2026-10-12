import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isPickupCompletedStatus } from '../../lib/orders/lifecycle.ts';
import { validateStatusTransition } from '../../lib/validations/schemas.ts';

test('only completed pickup lifecycle states route customers to the receipt', () => {
  assert.equal(isPickupCompletedStatus('PICKUP_COMPLETED'), true);
  assert.equal(isPickupCompletedStatus('PICKUP COMPLETED'), true);
  assert.equal(isPickupCompletedStatus(' pickup-completed '), true);
  assert.equal(isPickupCompletedStatus('SETTLEMENT_COMPLETED'), true);
  assert.equal(isPickupCompletedStatus('WEIGHING'), false);
  assert.equal(isPickupCompletedStatus('AGENT_ON_WAY'), false);
  assert.equal(isPickupCompletedStatus('CANCELLED'), false);
});

test('cancelled and completed orders cannot transition back into active pickup workflows', () => {
  for (const terminal of ['CANCELLED', 'PICKUP_COMPLETED', 'SETTLEMENT_COMPLETED']) {
    assert.equal(validateStatusTransition(terminal, 'AGENT_ASSIGNED'), false);
    assert.equal(validateStatusTransition(terminal, 'AGENT_ON_WAY'), false);
  }
  assert.equal(validateStatusTransition('BOOKING_RECEIVED', 'CANCELLED'), true);
});
