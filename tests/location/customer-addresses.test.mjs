import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPreferredSavedAddress, parseAddressCoordinate } from '../../lib/customerAddresses.ts';

test('coordinate parser rejects empty, null, coercion, non-finite, and out-of-range values', () => {
  for (const invalid of ['', '   ', null, undefined, false, 'Infinity', '12north', '91']) {
    assert.equal(parseAddressCoordinate(invalid, -90, 90), null, `${String(invalid)} must be rejected`);
  }
  assert.equal(parseAddressCoordinate('12.9716', -90, 90), 12.9716);
  assert.equal(parseAddressCoordinate(-180, -180, 180), -180);
});

test('saved address preference selects only an explicit default', () => {
  const recent = { id: 'recent', isDefault: false };
  const preferred = { id: 'preferred', isDefault: true };
  assert.equal(getPreferredSavedAddress([recent, preferred]), preferred);
  assert.equal(getPreferredSavedAddress([recent]), null);
  assert.equal(getPreferredSavedAddress([]), null);
});
