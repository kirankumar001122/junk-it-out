import assert from 'node:assert/strict';
import { test } from 'vitest';
import { errorResponse } from '../lib/utils/apiResponse';
import { validatePayload } from '../lib/auth/middleware';
import {
  assertCanReconcileOrder,
  isCustomerReconciliationActor,
  PaymentVerificationError,
} from '../lib/payments/verification';
import { getConfiguredBackendUrl } from '../apps/admin/lib/api';

test('Security Hardening Invariants: reconciliation actor, fail-closed auth, backend URL, sanitized 500 error responses', async () => {
  assert.equal(isCustomerReconciliationActor({ role: 'AGENT', customerId: 'c1' }), false);
  assert.equal(isCustomerReconciliationActor({ role: 'ADMIN', customerId: 'c1' }), false);
  assert.equal(isCustomerReconciliationActor({ role: 'CUSTOMER' }), false);
  assert.equal(isCustomerReconciliationActor({ role: 'CUSTOMER', customerId: 'c1' }), true);

  assert.throws(
    () => assertCanReconcileOrder({ customerId: 'owner' }, { role: 'CUSTOMER', customerId: 'other' }),
    (error: unknown) => error instanceof PaymentVerificationError && error.statusCode === 403,
  );
  assert.throws(
    () => assertCanReconcileOrder({ customerId: 'owner' }, { role: 'AGENT', customerId: 'owner' }),
    (error: unknown) => error instanceof PaymentVerificationError && error.statusCode === 403,
  );
  assert.doesNotThrow(() =>
    assertCanReconcileOrder({ customerId: 'owner' }, { role: 'CUSTOMER', customerId: 'owner' }),
  );

  const agentPayload = { userId: 'u1', role: 'AGENT', agentId: 'a1' } as any;
  assert.equal(
    await validatePayload(agentPayload, async () => {
      throw new Error('sensitive database detail');
    }),
    null,
    'Agent authentication must fail closed when its DB validation fails',
  );
  assert.equal(
    await validatePayload(agentPayload, async () => ({ tokenVersion: 2 }) as any),
    null,
    'A stale agent token must be rejected',
  );
  const customerPayload = { userId: 'u2', role: 'CUSTOMER', customerId: 'c2' } as any;
  assert.equal(await validatePayload(customerPayload, async () => {
    throw new Error('must not query for customers');
  }), customerPayload, 'Customer authentication behavior must remain unchanged');

  assert.throws(() => getConfiguredBackendUrl(undefined), /NEXT_PUBLIC_API_BASE_URL is required/);
  assert.throws(() => getConfiguredBackendUrl('https://user:pass@example.test'), /must use HTTPS/);
  assert.throws(() => getConfiguredBackendUrl('http://example.test'), /must use HTTPS/);
  assert.equal(getConfiguredBackendUrl('http://127.0.0.1:3001'), 'http://127.0.0.1:3001');
  assert.equal(getConfiguredBackendUrl('https://api.example.test/'), 'https://api.example.test');

  const internalResponse = errorResponse('INTERNAL_SERVER_ERROR', 'private database detail', 500, { secret: 'private' });
  const internalBody = await internalResponse.json();
  assert.equal(internalBody.error.message, 'An unexpected error occurred. Please try again.');
  assert.equal('details' in internalBody.error, false);
  const publicResponse = errorResponse('INVALID_INPUT', 'Safe validation message.', 400);
  assert.equal((await publicResponse.json()).error.message, 'Safe validation message.');
});
