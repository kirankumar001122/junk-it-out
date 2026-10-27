import { db } from '@/lib/db';
import { dispatchPaidOrderToAgents } from '@/lib/payments/verification';

export interface DispatchRecoveryOptions {
  serviceArea?: string;
  serviceAreas?: string[];
  limit?: number;
  dispatchFn?: (orderId: string) => Promise<unknown>;
}

export interface DispatchRecoverySummary {
  scanned: number;
  attempted: number;
  assigned: number;
  unassigned: number;
  skipped: number;
  errors: Array<{ orderId: string; error: string }>;
}

/**
 * Reconciles and dispatches paid orders that remain unassigned due to
 * an interrupted dispatch (e.g. server crash after payment capture DB commit)
 * or because no agent was immediately available at the instant payment was captured.
 *
 * Safeguards:
 * 1. ONLY targets orders with financialDirection === 'CUSTOMER_PAYS' and paymentStatus === 'CAPTURED'.
 * 2. Excludes orders with non-CAPTURED payments, active refund attempts, or refund-pending/refunded statuses.
 * 3. Excludes cancelled orders or orders that already have an agent assigned.
 * 4. Preserves service-area matching and agent availability checks.
 * 5. Leverages conditional atomic updates (agentId: null, status: 'AVAILABLE') to prevent race conditions.
 */
export async function reconcileUndispatchedPaidOrders(
  options?: DispatchRecoveryOptions,
): Promise<DispatchRecoverySummary> {
  const limit = Math.max(1, Math.min(options?.limit ?? 50, 100));
  const dispatch = options?.dispatchFn ?? dispatchPaidOrderToAgents;

  const candidates = await db.order.findMany({
    where: {
      financialDirection: 'CUSTOMER_PAYS',
      paymentStatus: 'CAPTURED',
      agentId: null,
      status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED'] },
      ...(options?.serviceAreas && options.serviceAreas.length > 0
        ? { address: { area: { in: options.serviceAreas } } }
        : options?.serviceArea
        ? { address: { area: options.serviceArea } }
        : {}),
      payments: {
        some: {
          direction: 'CUSTOMER_PAYS',
          status: 'CAPTURED',
        },
        none: {
          status: {
            in: [
              'REFUNDED',
              'PARTIALLY_REFUNDED',
              'REFUND_PENDING',
              'REFUND_PROCESSING',
              'REFUND_PENDING_RECONCILIATION',
              'REFUND_FAILED',
              'FAILED',
            ],
          },
        },
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      createdAt: true,
      address: { select: { area: true } },
    },
    orderBy: { createdAt: 'asc' },
    take: limit,
  });

  const summary: DispatchRecoverySummary = {
    scanned: candidates.length,
    attempted: 0,
    assigned: 0,
    unassigned: 0,
    skipped: 0,
    errors: [],
  };

  for (const candidate of candidates) {
    try {
      // 1. Guard against orders with active or pending refund attempts
      const activeRefund = await db.refundAttempt.findFirst({
        where: {
          orderId: candidate.id,
          status: { notIn: ['REFUND_FAILED'] },
        },
        select: { id: true, status: true },
      });

      if (activeRefund) {
        summary.skipped += 1;
        continue;
      }

      summary.attempted += 1;

      // 2. Execute idempotent dispatch
      await dispatch(candidate.id);

      // 3. Inspect updated order state to accurately report assignment outcome
      const refreshed = await db.order.findUnique({
        where: { id: candidate.id },
        select: { agentId: true, status: true },
      });

      if (refreshed?.agentId) {
        summary.assigned += 1;
      } else {
        summary.unassigned += 1;
      }
    } catch (err: any) {
      summary.errors.push({
        orderId: candidate.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return summary;
}
