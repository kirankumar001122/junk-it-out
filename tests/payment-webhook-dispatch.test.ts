import assert from 'node:assert/strict';
import { dispatchCapturedPayment } from '../lib/payments/webhookDispatch';

async function main() {
  const dispatched: string[] = [];
  const dispatch = async (orderId: string) => { dispatched.push(orderId); };

  assert.equal(await dispatchCapturedPayment('AUTHORIZED', 'order-a', dispatch), false);
  assert.deepEqual(dispatched, [], 'non-captured events must not dispatch');

  assert.equal(await dispatchCapturedPayment('CAPTURED', 'order-a', dispatch), true);
  assert.equal(await dispatchCapturedPayment('CAPTURED', 'order-a', dispatch), true);
  assert.deepEqual(dispatched, ['order-a', 'order-a'], 'duplicate delivery retries dispatch');

  let attempts = 0;
  const flakyDispatch = async (_orderId: string) => {
    attempts += 1;
    if (attempts === 1) throw new Error('simulated local dispatch/database failure');
  };

  await assert.rejects(
    dispatchCapturedPayment('CAPTURED', 'order-b', flakyDispatch),
    /simulated local dispatch\/database failure/,
  );
  assert.equal(
    await dispatchCapturedPayment('CAPTURED', 'order-b', flakyDispatch),
    true,
    'a later invocation can recover after the failed process has ended',
  );
  assert.equal(attempts, 2);

  process.stdout.write('Payment webhook dispatch retry checks passed.\n');
}

main().catch((error) => {
  process.stderr.write(`Payment webhook dispatch checks failed: ${error instanceof Error ? error.name : 'UnknownError'}\n`);
  process.exitCode = 1;
});
