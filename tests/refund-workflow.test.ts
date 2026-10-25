import assert from 'node:assert/strict';
import {
  applyRefundEventOnce,
  canApplyRefundStatus,
  executeRefundWorkflow,
  isRefundResultForRequest,
  reconcileRefundWorkflow,
  refundAttemptId,
  refundEventId,
  refundIdempotencyKey,
  type RefundProviderResult,
} from '../lib/payments/refundWorkflow';

const key = refundIdempotencyKey('payment-record-1');
const successfulRefund: RefundProviderResult = {
  id: 'rfnd_mock_1',
  payment_id: 'pay_mock_1',
  amount: 12500,
  currency: 'INR',
  status: 'processed',
  notes: { refund_request_key: key },
};

function deps(overrides: Partial<Parameters<typeof executeRefundWorkflow>[1]> = {}) {
  const persisted: string[] = [];
  let claimed = true;
  let submitted = 0;
  let uncertain = 0;
  return {
    persisted,
    get submitted() { return submitted; },
    get uncertain() { return uncertain; },
    setClaimed(value: boolean) { claimed = value; },
    ...{
      claim: async () => claimed,
      submit: async () => { submitted += 1; return successfulRefund; },
      persist: async (status: string) => { persisted.push(status); },
      markUncertain: async () => { uncertain += 1; },
      isDefinitiveRejection: () => false,
    },
    ...overrides,
  };
}

async function main() {
  assert.equal(key, refundIdempotencyKey('payment-record-1'));
  assert.match(key, /^[A-Za-z0-9_-]{10,}$/);
  assert.equal(isRefundResultForRequest(successfulRefund, {
    paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key,
  }), true);
  assert.equal(isRefundResultForRequest({ ...successfulRefund, amount: 12501 }, {
    paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key,
  }), false);

  const callOrder: string[] = [];
  let successPosts = 0;
  const success = deps({
    claim: async () => { callOrder.push('attempt-persisted'); return true; },
    submit: async () => {
      assert.deepEqual(callOrder, ['attempt-persisted'], 'attempt claim/persistence must finish before provider submission');
      callOrder.push('provider-submit');
      successPosts += 1;
      return successfulRefund;
    },
  });
  let savedProviderRefundId: string | undefined;
  success.persist = async (status: string, refund?: RefundProviderResult) => {
    success.persisted.push(status);
    savedProviderRefundId = typeof refund?.id === 'string' ? refund.id : undefined;
  };
  const successResult = await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, success);
  assert.equal(successResult.kind, 'processed');
  assert.deepEqual(success.persisted, ['REFUNDED']);
  assert.equal(successPosts, 1);
  assert.deepEqual(callOrder, ['attempt-persisted', 'provider-submit']);
  assert.equal(savedProviderRefundId, 'rfnd_mock_1');
  assert.equal(refundAttemptId('payment-record-1'), refundAttemptId('payment-record-1'));

  const duplicate = deps();
  duplicate.setClaimed(false);
  assert.equal((await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, duplicate)).kind, 'claimed-elsewhere');
  assert.equal(duplicate.submitted, 0, 'duplicate requests must not call the provider');

  const rejected = deps({
    submit: async () => { throw { statusCode: 422, message: 'provider rejection' }; },
    isDefinitiveRejection: (error) => Boolean(error && typeof error === 'object' && 'statusCode' in error && (error as { statusCode: number }).statusCode === 422),
  });
  assert.equal((await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, rejected)).kind, 'rejected');
  assert.deepEqual(rejected.persisted, ['REFUND_FAILED']);
  assert.equal(rejected.uncertain, 0);

  let timeoutPosts = 0;
  const timedOut = deps({ submit: async () => { timeoutPosts += 1; throw new Error('simulated provider timeout'); } });
  assert.equal((await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, timedOut)).kind, 'pending');
  assert.equal(timedOut.uncertain, 1);
  assert.deepEqual(timedOut.persisted, [], 'timeout must not be marked refunded or failed');
  assert.equal(timeoutPosts, 1);

  const databaseFailure = deps({ persist: async () => { throw new Error('simulated database failure'); } });
  assert.equal((await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, databaseFailure)).kind, 'persistence-failed');
  assert.equal(databaseFailure.submitted, 1);

  const mismatched = deps({ submit: async () => ({ ...successfulRefund, payment_id: 'pay_other' }) });
  assert.equal((await executeRefundWorkflow({ paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key }, mismatched)).kind, 'pending');
  assert.equal(mismatched.uncertain, 1, 'mismatched provider evidence must not mark success');

  const webhookEvents = new Set<string>();
  let webhookStatus = 'REFUND_PENDING';
  const eventIdentity = 'provider-event:evt_mock_1';
  const applyWebhook = () => applyRefundEventOnce({
    currentStatus: webhookStatus,
    nextStatus: 'REFUNDED',
    recordEvent: async () => {
      const eventId = refundEventId('attempt-1', eventIdentity);
      if (webhookEvents.has(eventId)) return false;
      webhookEvents.add(eventId);
      return true;
    },
    persistStatus: async () => { webhookStatus = 'REFUNDED'; },
  });
  assert.equal(await applyWebhook(), 'applied');
  assert.equal(await applyWebhook(), 'duplicate', 'duplicate webhook delivery is idempotent');
  assert.equal(webhookEvents.size, 1);
  assert.equal(await applyRefundEventOnce({
    currentStatus: webhookStatus,
    nextStatus: 'REFUND_PENDING',
    recordEvent: async () => true,
    persistStatus: async () => { webhookStatus = 'REFUND_PENDING'; },
  }), 'stale');
  assert.equal(webhookStatus, 'REFUNDED', 'delayed pending webhook cannot revert processed refund');
  assert.equal(canApplyRefundStatus('REFUNDED', 'REFUND_PENDING'), false);
  assert.equal(canApplyRefundStatus('REFUND_FAILED', 'REFUND_PENDING'), false);

  let reconciliationSavedId: string | undefined;
  let noMatchEvents = 0;
  const reconciled = await reconcileRefundWorkflow({
    paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key,
  }, {
    fetchRefunds: async () => [successfulRefund],
    persist: async (status, refund) => {
      assert.equal(status, 'REFUNDED');
      reconciliationSavedId = String(refund.id);
    },
    recordNoMatch: async () => { noMatchEvents += 1; },
  });
  assert.equal(reconciled.kind, 'processed', 'provider lookup can recover a timed-out refund');
  assert.equal(reconciliationSavedId, 'rfnd_mock_1');
  assert.equal(noMatchEvents, 0);
  assert.equal(timeoutPosts, 1, 'reconciliation uses refund lookup and does not repeat provider POST');

  let legacyPersisted = false;
  const legacy = await reconcileRefundWorkflow({
    paymentId: 'pay_mock_1', amountInPaise: 12500, idempotencyKey: key,
  }, {
    fetchRefunds: async () => [],
    persist: async () => { legacyPersisted = true; },
    recordNoMatch: async (reason) => { assert.equal(reason, 'NO_MATCH'); },
  });
  assert.equal(legacy.kind, 'pending', 'legacy REFUNDED state without provider evidence remains unconfirmed');
  assert.equal(legacyPersisted, false);

  process.stdout.write('Refund workflow safety checks passed.\n');
}

main().catch((error) => {
  process.stderr.write(`Refund workflow checks failed: ${error instanceof Error ? error.stack : 'UnknownError'}\n`);
  process.exitCode = 1;
});
