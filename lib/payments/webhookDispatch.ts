/**
 * Dispatch captured payments both on first processing and on provider retries.
 * Throwing lets the webhook return a retryable failure when dispatch itself
 * fails; it must not acknowledge work that has not completed.
 */
export async function dispatchCapturedPayment(
  paymentStatus: string,
  orderId: string,
  dispatch: (orderId: string) => Promise<unknown>,
): Promise<boolean> {
  if (paymentStatus !== 'CAPTURED') return false;
  await dispatch(orderId);
  return true;
}
