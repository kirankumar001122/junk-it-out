import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isMissingFormattedAddressColumnError } from '../../lib/orders/readWithFormattedAddressFallback.ts';

test('legacy fallback matches only the missing formattedAddress column', () => {
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      meta: { column: 'Address.formattedAddress' },
    }),
    true
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      message: 'The column `Address.formattedAddress` does not exist in the database.',
    }),
    true
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      meta: { column: 'Address.street' },
      message: 'The query also selected formattedAddress.',
    }),
    false
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      meta: { column: 'OtherModel.formattedAddress' },
    }),
    false
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      message: 'The column `formattedAddress` does not exist in the database.',
    }),
    false
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P2022',
      meta: { column: 'Address.street' },
    }),
    false
  );
  assert.equal(
    isMissingFormattedAddressColumnError({
      code: 'P1001',
      message: 'The database is unreachable.',
    }),
    false
  );
});
