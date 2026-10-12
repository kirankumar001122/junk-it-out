import assert from 'node:assert/strict';
import { readCustomerPickupsResponse } from '../lib/customerPickupsResponse';

const response = (status: number, body: unknown, throws = false) => ({
  status,
  async json() {
    if (throws) throw new Error('invalid JSON');
    return body;
  },
});

async function run() {
  assert.deepEqual(
    await readCustomerPickupsResponse(response(200, { success: true, data: [{ id: 'owned-order' }] })),
    { kind: 'orders', orders: [{ id: 'owned-order' }] },
    'signed-in customers with orders receive the API order list',
  );
  assert.deepEqual(
    await readCustomerPickupsResponse(response(200, { success: true, data: [] })),
    { kind: 'orders', orders: [] },
    'customers with no orders receive an empty list',
  );
  assert.deepEqual(
    await readCustomerPickupsResponse(response(401, '<html>login</html>', true)),
    { kind: 'unauthenticated' },
    'missing and expired sessions lead to the sign-in state even if an edge returns HTML',
  );
  assert.deepEqual(
    await readCustomerPickupsResponse(response(403, {
      success: false,
      error: { code: 'FORBIDDEN', message: 'Access denied.' },
    })),
    { kind: 'error', message: 'Access denied.' },
    'authorization failures are shown as failures rather than as empty pickup history',
  );
  assert.deepEqual(
    await readCustomerPickupsResponse(response(500, null, true)),
    {
      kind: 'error',
      message: 'The pickup service returned an unreadable response. Please retry.',
    },
    'non-JSON server errors do not cause a client parsing exception',
  );
  assert.deepEqual(
    await readCustomerPickupsResponse(response(200, { success: true, data: {} })),
    {
      kind: 'error',
      message: 'The pickup service returned an unexpected response. Please retry.',
    },
    'malformed success payloads are not treated as empty customer data',
  );

  console.log('Customer pickups response tests passed.');
}

void run();
