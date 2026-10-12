import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readWithFormattedAddressFallback } from '../../lib/orders/readWithFormattedAddressFallback.ts';

const missingFormattedAddressColumn = {
  code: 'P2022',
  meta: { column: 'Address.formattedAddress' },
};

test('order list retries without formattedAddress and returns the actual legacy rows', async () => {
  const calls = [];
  const realRows = [
    { id: 'order-1', status: 'PICKUP_COMPLETED', address: { id: 'address-1', street: '6th A Cross' } },
  ];

  const result = await readWithFormattedAddressFallback(
    async () => {
      calls.push('with-formatted-address');
      throw missingFormattedAddressColumn;
    },
    async () => {
      calls.push('legacy-select-without-formatted-address');
      return realRows;
    },
    (rows) => rows.map((order) => ({
      ...order,
      address: order.address ? { ...order.address, formattedAddress: null } : null,
    }))
  );

  assert.deepEqual(calls, ['with-formatted-address', 'legacy-select-without-formatted-address']);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'order-1');
  assert.equal(result[0].status, 'PICKUP_COMPLETED');
  assert.equal(result[0].address.street, '6th A Cross');
  assert.equal(result[0].address.formattedAddress, null);
});

test('order detail retries without formattedAddress and preserves the actual order', async () => {
  const calls = [];
  const realOrder = {
    id: 'order-2',
    customerId: 'customer-1',
    paymentStatus: 'CAPTURED',
    address: { id: 'address-2', city: 'Bengaluru' },
  };

  const result = await readWithFormattedAddressFallback(
    async () => {
      calls.push('with-formatted-address');
      throw missingFormattedAddressColumn;
    },
    async () => {
      calls.push('legacy-select-without-formatted-address');
      return realOrder;
    },
    (order) => order
      ? { ...order, address: order.address ? { ...order.address, formattedAddress: null } : null }
      : order
  );

  assert.deepEqual(calls, ['with-formatted-address', 'legacy-select-without-formatted-address']);
  assert.equal(result.id, 'order-2');
  assert.equal(result.customerId, 'customer-1');
  assert.equal(result.paymentStatus, 'CAPTURED');
  assert.equal(result.address.city, 'Bengaluru');
  assert.equal(result.address.formattedAddress, null);
});

test('unrelated Prisma failures propagate without a legacy retry', async () => {
  const calls = [];
  const failure = { code: 'P1001', message: 'Database unavailable' };

  await assert.rejects(
    readWithFormattedAddressFallback(
      async () => {
        calls.push('primary');
        throw failure;
      },
      async () => {
        calls.push('legacy');
        return [];
      },
      (value) => value
    ),
    (error) => error === failure
  );
  assert.deepEqual(calls, ['primary']);
});
