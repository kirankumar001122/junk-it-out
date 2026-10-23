import { createHash } from 'node:crypto';

export type RefundProviderResult = {
  id?: unknown;
  payment_id?: unknown;
  amount?: unknown;
  currency?: unknown;
  status?: unknown;
  notes?: unknown;
};

export type RefundWorkflowResult =
  | { kind: 'claimed-elsewhere' }
  | { kind: 'processed'; refund: RefundProviderResult }
  | { kind: 'pending'; refund?: RefundProviderResult }
  | { kind: 'failed'; refund?: RefundProviderResult }
  | { kind: 'rejected' }
  | { kind: 'persistence-failed' };

export function refundIdempotencyKey(paymentRecordId: string, customSuffix?: string) {
  const content = customSuffix ? `${paymentRecordId}:${customSuffix}` : paymentRecordId;
  const digest = createHash('sha256').update(content).digest('hex');
  return `jio_refund_${digest}`;
}

export function refundAttemptId(paymentRecordId: string, customSuffix?: string) {
  const content = customSuffix ? `${paymentRecordId}:${customSuffix}` : paymentRecordId;
  const digest = createHash('sha256').update(content).digest('hex');
  return `refund_attempt_${digest}`;
}

/** Stable event primary key makes Razorpay webhook retries idempotent. */
export function refundEventId(attemptId: string, eventIdentity: string) {
  const digest = createHash('sha256').update(`${attemptId}:${eventIdentity}`).digest('hex');
  return `refund_event_${digest}`;
}

export function refundStatusFromProviderStatus(status: unknown) {
  if (status === 'processed') return 'REFUNDED' as const;
  if (status === 'pending') return 'REFUND_PENDING' as const;
  if (status === 'failed') return 'REFUND_FAILED' as const;
  return null;
}

/** A processed full refund is final; delayed provider events remain audit-only.
 * Authoritative provider processed evidence can confirm a previously failed refund. */
export function canApplyRefundStatus(current: string, next: string) {
  if (current === 'REFUNDED') return next === 'REFUNDED';
  if (current === 'REFUND_FAILED') return next === 'REFUNDED' || next === 'REFUND_FAILED' || next === 'PARTIALLY_REFUNDED';
  return true;
}

export const IN_FLIGHT_REFUND_STATUSES = [
  'REFUND_PROCESSING',
  'REFUND_PENDING',
  'REFUND_PENDING_RECONCILIATION',
  'PENDING',
  'PROCESSING',
  'RECONCILIATION_REQUIRED',
] as const;

export function calculateRefundTotals(
  paymentAmount: number,
  attempts: Array<{ id: string; amount: number; status: string }>
) {
  const totalPaise = Math.round(Number(paymentAmount) * 100);
  let settledPaise = 0;
  let inFlightPaise = 0;

  for (const a of attempts) {
    const aPaise = Math.round(Number(a.amount) * 100);
    if (a.status === 'REFUNDED') {
      settledPaise += aPaise;
    } else if ((IN_FLIGHT_REFUND_STATUSES as readonly string[]).includes(a.status)) {
      inFlightPaise += aPaise;
    }
  }

  const remainingPaise = Math.max(0, totalPaise - settledPaise);
  const availablePaise = Math.max(0, totalPaise - settledPaise - inFlightPaise);

  return {
    totalPaise,
    settledPaise,
    inFlightPaise,
    remainingPaise,
    availablePaise,
    totalAmount: Number(paymentAmount),
    settledAmount: settledPaise / 100,
    inFlightAmount: inFlightPaise / 100,
    remainingAmount: remainingPaise / 100,
    availableAmount: availablePaise / 100,
  };
}

/** Callers run both callbacks inside the same database transaction. */
export async function applyRefundEventOnce(input: {
  currentStatus: string;
  nextStatus: string;
  recordEvent: () => Promise<boolean>;
  persistStatus: () => Promise<void>;
}): Promise<'duplicate' | 'stale' | 'applied'> {
  if (!await input.recordEvent()) return 'duplicate';
  if (!canApplyRefundStatus(input.currentStatus, input.nextStatus)) return 'stale';
  await input.persistStatus();
  return 'applied';
}

export async function reconcileRefundWorkflow(input: {
  paymentId: string;
  amountInPaise: number;
  idempotencyKey: string;
}, deps: {
  fetchRefunds: () => Promise<RefundProviderResult[]>;
  persist: (status: 'REFUNDED' | 'REFUND_PENDING' | 'REFUND_FAILED', refund: RefundProviderResult) => Promise<void>;
  recordNoMatch: (reason: 'NO_MATCH' | 'MISMATCHED_OR_UNSUPPORTED') => Promise<void>;
}): Promise<RefundWorkflowResult> {
  const refunds = await deps.fetchRefunds();
  const refund = refunds.find((candidate) => isRefundResultForRequest(candidate, input));
  const status = refundStatusFromProviderStatus(refund?.status);
  if (!refund || !status) {
    await deps.recordNoMatch(refund ? 'MISMATCHED_OR_UNSUPPORTED' : 'NO_MATCH');
    return { kind: 'pending', refund };
  }
  await deps.persist(status, refund);
  if (status === 'REFUNDED') return { kind: 'processed', refund };
  if (status === 'REFUND_FAILED') return { kind: 'failed', refund };
  return { kind: 'pending', refund };
}

export function isRefundResultForRequest(
  refund: RefundProviderResult,
  expected: { paymentId: string; amountInPaise: number; idempotencyKey: string },
): boolean {
  const notes = refund.notes as Record<string, unknown> | null | undefined;
  return Boolean(
    typeof refund.id === 'string' && refund.id.trim() &&
    refund.payment_id === expected.paymentId &&
    Number(refund.amount) === expected.amountInPaise &&
    refund.currency === 'INR' &&
    notes?.refund_request_key === expected.idempotencyKey,
  );
}

export async function executeRefundWorkflow(input: {
  paymentId: string;
  amountInPaise: number;
  idempotencyKey: string;
}, deps: {
  claim: () => Promise<boolean>;
  submit: () => Promise<RefundProviderResult>;
  persist: (status: 'REFUNDED' | 'REFUND_PENDING' | 'REFUND_PENDING_RECONCILIATION' | 'REFUND_FAILED', refund?: RefundProviderResult) => Promise<void>;
  markUncertain: (reason: 'PROVIDER_OUTCOME_UNKNOWN' | 'PROVIDER_EVIDENCE_MISMATCH') => Promise<void>;
  isDefinitiveRejection: (error: unknown) => boolean;
}): Promise<RefundWorkflowResult> {
  if (!await deps.claim()) return { kind: 'claimed-elsewhere' };

  let refund: RefundProviderResult;
  try {
    refund = await deps.submit();
  } catch (error) {
    if (deps.isDefinitiveRejection(error)) {
      try {
        await deps.persist('REFUND_FAILED');
      } catch {
        return { kind: 'persistence-failed' };
      }
      return { kind: 'rejected' };
    }
    await deps.markUncertain('PROVIDER_OUTCOME_UNKNOWN');
    return { kind: 'pending' };
  }

  if (!isRefundResultForRequest(refund, input)) {
    await deps.markUncertain('PROVIDER_EVIDENCE_MISMATCH');
    return { kind: 'pending' };
  }

  const status = refund.status === 'processed'
    ? 'REFUNDED'
    : refund.status === 'pending'
      ? 'REFUND_PENDING'
      : refund.status === 'failed'
        ? 'REFUND_FAILED'
        : null;

  if (!status) {
    await deps.markUncertain('PROVIDER_EVIDENCE_MISMATCH');
    return { kind: 'pending' };
  }

  try {
    await deps.persist(status, refund);
  } catch {
    // Keep the already-claimed state. A later request reconciles by listing
    // provider refunds and matching the stable marker; it never POSTs again.
    return { kind: 'persistence-failed' };
  }

  if (status === 'REFUNDED') return { kind: 'processed', refund };
  if (status === 'REFUND_FAILED') return { kind: 'failed', refund };
  return { kind: 'pending', refund };
}
