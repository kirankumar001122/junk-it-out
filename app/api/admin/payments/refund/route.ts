import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  fetchRazorpayPaymentRefunds,
  RazorpayApiError,
  refundRazorpayPayment,
} from '@/lib/payments/razorpay';
import {
  applyRefundEventOnce,
  calculateRefundTotals,
  executeRefundWorkflow,
  IN_FLIGHT_REFUND_STATUSES,
  isRefundResultForRequest,
  reconcileRefundWorkflow,
  refundAttemptId,
  refundEventId,
  refundIdempotencyKey,
  refundStatusFromProviderStatus,
  type RefundProviderResult,
} from '@/lib/payments/refundWorkflow';

const MUTABLE_REFUND_ATTEMPT_STATUSES = [
  'PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED', 'REFUND_FAILED', 'RESET_TO_CAPTURED', 'PARTIALLY_REFUNDED', ...IN_FLIGHT_REFUND_STATUSES,
];

type LocalRefundStatus = 'REFUNDED' | 'REFUND_PENDING' | 'REFUND_PENDING_RECONCILIATION' | 'REFUND_FAILED' | 'PARTIALLY_REFUNDED';

function responseForRefund(status: string, paymentId: string, refundId?: string | null, extra?: Record<string, any>) {
  if (status === 'REFUNDED') {
    return NextResponse.json({
      success: true,
      message: 'Refund processed by Razorpay.',
      data: { paymentId, status, razorpayRefundId: refundId || undefined, ...extra },
    });
  }
  if (status === 'PARTIALLY_REFUNDED') {
    return NextResponse.json({
      success: true,
      message: 'Partial refund processed by Razorpay.',
      data: { paymentId, status, razorpayRefundId: refundId || undefined, ...extra },
    });
  }
  if (status === 'REFUND_FAILED') {
    return NextResponse.json({
      success: false,
      message: 'Razorpay reports that this refund failed. Review the provider record before requesting another action.',
      data: { paymentId, status, razorpayRefundId: refundId || undefined, ...extra },
    }, { status: 409 });
  }
  return NextResponse.json({
    success: false,
    message: 'Refund status is pending reconciliation. No second refund request was sent.',
    data: { paymentId, status, razorpayRefundId: refundId || undefined, ...extra },
  }, { status: 202 });
}

function providerDetails(refund?: RefundProviderResult) {
  if (!refund) return {};
  return {
    ...(typeof refund.id === 'string' ? { providerRefundId: refund.id } : {}),
    ...(typeof refund.payment_id === 'string' ? { providerPaymentId: refund.payment_id } : {}),
    ...(typeof refund.status === 'string' ? { providerStatus: refund.status } : {}),
    ...(typeof refund.amount === 'number' ? { amountPaise: refund.amount } : {}),
    ...(typeof refund.currency === 'string' ? { currency: refund.currency } : {}),
  };
}

async function persistAttemptObservation(input: {
  attemptId: string;
  paymentId: string;
  orderId: string;
  status: LocalRefundStatus;
  eventType: string;
  source: string;
  refund?: RefundProviderResult;
  failureReason?: string;
  stableEventIdentity?: string;
}) {
  return db.$transaction(async (tx) => {
    const attempt = await tx.refundAttempt.findUnique({ where: { id: input.attemptId } });
    if (!attempt) throw new Error('Refund attempt record is missing.');

    const eventDetails = {
      source: input.source,
      ...providerDetails(input.refund),
      ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    };
    const eventCreate = async () => {
      const result = await tx.refundAttemptEvent.createMany({
        data: [{
          id: input.stableEventIdentity
            ? refundEventId(input.attemptId, input.stableEventIdentity)
            : randomUUID(),
          refundAttemptId: input.attemptId,
          eventType: input.eventType,
          status: input.status,
          details: eventDetails,
        }],
        skipDuplicates: true,
      });
      return result.count === 1;
    };

    let staleAttemptStatus = false;
    const outcome = await applyRefundEventOnce({
      currentStatus: attempt.status,
      nextStatus: input.status,
      recordEvent: eventCreate,
      persistStatus: async () => {
        const attemptUpdate = await tx.refundAttempt.updateMany({
          where: { id: input.attemptId, status: { in: MUTABLE_REFUND_ATTEMPT_STATUSES } },
          data: {
            status: input.status,
            ...(typeof input.refund?.id === 'string' ? { razorpayRefundId: input.refund.id } : {}),
            failureReason: input.failureReason ?? null,
          },
        });
        if (attemptUpdate.count === 0) {
          const latestAttempt = await tx.refundAttempt.findUnique({ where: { id: input.attemptId }, select: { status: true } });
          if (!latestAttempt || latestAttempt.status !== input.status) {
            staleAttemptStatus = true;
            return;
          }
        }

        const payment = await tx.payment.findUnique({ where: { id: input.paymentId }, select: { status: true, amount: true } });
        const order = await tx.order.findUnique({ where: { id: input.orderId }, select: { paymentStatus: true } });
        if (!payment || !order) throw new Error('Refund payment or order record is missing.');

        const allAttempts = await tx.refundAttempt.findMany({
          where: { paymentId: input.paymentId },
          select: { id: true, amount: true, status: true },
        });
        const totalPaymentPaise = Math.round(Number(payment.amount) * 100);
        let settledPaise = 0;
        for (const a of allAttempts) {
          const effectiveStatus = a.id === input.attemptId ? input.status : a.status;
          if (effectiveStatus === 'REFUNDED') {
            settledPaise += Math.round(Number(a.amount) * 100);
          }
        }

        let targetStatus: string;
        if (input.status === 'REFUNDED') {
          targetStatus = settledPaise >= totalPaymentPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        } else if (input.status === 'REFUND_FAILED') {
          targetStatus = settledPaise > 0 ? 'PARTIALLY_REFUNDED' : 'REFUND_FAILED';
        } else {
          targetStatus = input.status;
        }

        if (payment.status === 'REFUNDED' && targetStatus !== 'REFUNDED') return;
        const allowed = [...IN_FLIGHT_REFUND_STATUSES, 'REFUND_FAILED', 'CAPTURED', 'PARTIALLY_REFUNDED'];
        if (payment.status !== targetStatus && !allowed.includes(payment.status)) {
          throw new Error('Payment status changed during refund reconciliation.');
        }
        if (order.paymentStatus !== targetStatus && !allowed.includes(order.paymentStatus)) {
          throw new Error('Order status changed during refund reconciliation.');
        }
        const paymentUpdate = await tx.payment.updateMany({
          where: { id: input.paymentId, status: { in: allowed } },
          data: { status: targetStatus },
        });
        if (paymentUpdate.count === 0 && payment.status !== targetStatus) {
          throw new Error('Payment status changed during refund reconciliation.');
        }
        const orderUpdate = await tx.order.updateMany({
          where: { id: input.orderId, paymentStatus: { in: allowed } },
          data: { paymentStatus: targetStatus },
        });
        if (orderUpdate.count === 0 && order.paymentStatus !== targetStatus) {
          throw new Error('Order status changed during refund reconciliation.');
        }
      },
    });
    return staleAttemptStatus ? 'stale' : outcome;
  });
}

async function recordAttemptEvent(input: {
  attemptId: string;
  eventType: string;
  status: string;
  details: Record<string, unknown>;
  stableEventIdentity?: string;
}) {
  await db.refundAttemptEvent.createMany({
    data: [{
      id: input.stableEventIdentity
        ? refundEventId(input.attemptId, input.stableEventIdentity)
        : randomUUID(),
      refundAttemptId: input.attemptId,
      eventType: input.eventType,
      status: input.status,
      details: input.details as Prisma.InputJsonObject,
    }],
    skipDuplicates: true,
  });
}

async function ensureLegacyAttempt(payment: { id: string; orderId: string; amount: number }) {
  const id = refundAttemptId(payment.id);
  await db.$transaction(async (tx) => {
    await tx.refundAttempt.createMany({
      data: [{
        id,
        orderId: payment.orderId,
        paymentId: payment.id,
        amount: payment.amount,
        status: 'RECONCILIATION_REQUIRED',
      }],
      skipDuplicates: true,
    });
    await tx.refundAttemptEvent.createMany({
      data: [{
        id: refundEventId(id, 'LEGACY_REFUND_STATUS_DISCOVERED'),
        refundAttemptId: id,
        eventType: 'LEGACY_REFUND_STATUS_DISCOVERED',
        status: 'RECONCILIATION_REQUIRED',
        details: { source: 'ADMIN_RECONCILIATION', note: 'Existing status has no linked verified refund attempt.' },
      }],
      skipDuplicates: true,
    });
  });
  return id;
}

async function reconcileFromProvider(payment: any, attemptId: string) {
  const attempt = await db.refundAttempt.findUnique({
    where: { id: attemptId },
    include: { events: { orderBy: { createdAt: 'desc' } } },
  });
  const attemptAmountPaise = attempt
    ? Math.round(Number(attempt.amount) * 100)
    : Math.round(Number(payment.amount) * 100);

  const requestedEvent = attempt?.events?.find((e: any) => e.eventType === 'REFUND_REQUESTED');
  const key = (requestedEvent?.details as any)?.idempotencyKey || refundIdempotencyKey(payment.id);

  let persistenceOutcome: 'duplicate' | 'stale' | 'applied' | undefined;
  const result = await reconcileRefundWorkflow({
    paymentId: payment.paymentId,
    amountInPaise: attemptAmountPaise,
    idempotencyKey: key,
  }, {
    fetchRefunds: async () => {
      const response = await fetchRazorpayPaymentRefunds(payment.paymentId);
      return Array.isArray(response?.items) ? response.items as RefundProviderResult[] : [];
    },
    persist: async (status, refund) => {
      persistenceOutcome = await persistAttemptObservation({
        attemptId,
        paymentId: payment.id,
        orderId: payment.orderId,
        status,
        eventType: 'REFUND_RECONCILED',
        source: 'RAZORPAY_REFUND_LIST',
        refund,
      });
    },
    recordNoMatch: async (reason) => {
      await recordAttemptEvent({
        attemptId,
        eventType: reason === 'NO_MATCH' ? 'RECONCILIATION_NO_MATCH' : 'RECONCILIATION_EVIDENCE_REJECTED',
        status: 'RECONCILIATION_REQUIRED',
        details: { source: 'RAZORPAY_REFUND_LIST', result: reason },
      });
    },
  });

  if (persistenceOutcome === 'stale' || persistenceOutcome === 'duplicate') {
    return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
  }
  if (result.kind === 'processed' || result.kind === 'failed' || result.kind === 'pending') {
    if (result.refund) {
      const latestPayment = await db.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
      const effectiveStatus = latestPayment?.status ?? refundStatusFromProviderStatus(result.refund.status);
      if (effectiveStatus) return responseForRefund(effectiveStatus, payment.id, String(result.refund.id));
    }
    if (payment.status === 'REFUND_FAILED') {
      return NextResponse.json({
        success: false,
        message: 'No refund was recorded at Razorpay. The previous refund attempt was never accepted by the provider. You may safely reset this payment to CAPTURED for re-attempt.',
        data: {
          paymentId: payment.id,
          status: 'REFUND_FAILED',
          canResetToCaptured: true,
        },
      }, { status: 200 });
    }
    return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
  }
  return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const paymentRecordId = body?.paymentRecordId;
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : '';
    if (typeof paymentRecordId !== 'string' || !paymentRecordId.trim() || paymentRecordId.length > 128) {
      return NextResponse.json({ success: false, message: 'A valid payment record ID is required.' }, { status: 400 });
    }
    if (reason.length > 500) {
      return NextResponse.json({ success: false, message: 'Refund reason must be 500 characters or fewer.' }, { status: 400 });
    }

    let payment = await db.payment.findUnique({ where: { id: paymentRecordId }, include: { order: true } });
    if (!payment) {
      const cleanId = paymentRecordId.startsWith('pay-') ? paymentRecordId.slice(4) : paymentRecordId;
      payment = await db.payment.findFirst({
        where: { direction: 'CUSTOMER_PAYS', gateway: 'RAZORPAY', OR: [{ id: cleanId }, { orderId: cleanId }, { paymentId: cleanId }] },
        include: { order: true },
      });
    }
    if (!payment) return NextResponse.json({ success: false, message: 'Payment record not found.' }, { status: 404 });
    if (payment.direction !== 'CUSTOMER_PAYS' || payment.gateway !== 'RAZORPAY') {
      return NextResponse.json({ success: false, message: 'This payment is not refundable through Razorpay.' }, { status: 400 });
    }
    if (!payment.paymentId || payment.paymentId === 'N/A') {
      return NextResponse.json({ success: false, message: 'No provider payment ID is available for this record.' }, { status: 400 });
    }

    // 1. Fetch all existing refund attempts for this payment
    const existingAttempts = await db.refundAttempt.findMany({
      where: { paymentId: payment.id },
      orderBy: { createdAt: 'desc' },
    });
    const totals = calculateRefundTotals(Number(payment.amount), existingAttempts);

    // -----------------------------------------------------------------
    // SAFE RECOVERY: Reset a REFUND_FAILED payment back to CAPTURED/PARTIALLY_REFUNDED,
    // but ONLY after proving via Razorpay lookup that no refund was created.
    // -----------------------------------------------------------------
    if (body?.action === 'reset_failed') {
      if (payment.status !== 'REFUND_FAILED') {
        return NextResponse.json({
          success: false,
          message: `Only payments in REFUND_FAILED status can be reset. Current status is "${payment.status}".`,
        }, { status: 400 });
      }

      let refunds: RefundProviderResult[] = [];
      try {
        const response = await fetchRazorpayPaymentRefunds(payment.paymentId);
        refunds = Array.isArray(response?.items) ? (response.items as RefundProviderResult[]) : [];
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: 'Cannot safely verify refund status with Razorpay. Try again later.',
        }, { status: 502 });
      }

      const defaultKey = refundIdempotencyKey(payment.id);
      const matchingRefund = refunds.find((r) =>
        isRefundResultForRequest(r, {
          paymentId: payment.paymentId!,
          amountInPaise: Math.round(Number(payment.amount) * 100),
          idempotencyKey: defaultKey,
        }) || Boolean(r.id)
      );

      const targetAttemptId = existingAttempts[0]?.id ?? refundAttemptId(payment.id);

      if (matchingRefund && matchingRefund.status === 'processed') {
        await persistAttemptObservation({
          attemptId: targetAttemptId,
          paymentId: payment.id,
          orderId: payment.orderId,
          status: 'REFUNDED',
          eventType: 'REFUND_RECONCILED',
          source: 'RAZORPAY_REFUND_LIST',
          refund: matchingRefund,
        });
        return NextResponse.json({
          success: true,
          message: 'Provider reports this refund was actually processed. Status updated to REFUNDED.',
          data: { paymentId: payment.id, status: 'REFUNDED', razorpayRefundId: matchingRefund.id },
        });
      }

      if (matchingRefund && matchingRefund.status !== 'failed') {
        return NextResponse.json({
          success: false,
          message: `Razorpay has an existing refund record (${matchingRefund.id}) with status "${matchingRefund.status}". Cannot reset.`,
          data: { paymentId: payment.id, status: payment.status, razorpayRefundId: matchingRefund.id },
        }, { status: 409 });
      }

      // Verified no provider refund exists: safely reset back to CAPTURED or PARTIALLY_REFUNDED
      const resetTargetStatus = totals.settledPaise > 0 ? 'PARTIALLY_REFUNDED' : 'CAPTURED';
      await db.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: resetTargetStatus },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: resetTargetStatus },
        });
        await tx.refundAttempt.updateMany({
          where: { id: targetAttemptId },
          data: { status: 'RESET_TO_CAPTURED', failureReason: 'RESET_AFTER_VERIFIED_NO_PROVIDER_RECORD' },
        });
        await tx.refundAttemptEvent.createMany({
          data: [{
            id: refundEventId(targetAttemptId, `RESET_TO_CAPTURED_${Date.now()}`),
            refundAttemptId: targetAttemptId,
            eventType: 'REFUND_RESET_TO_CAPTURED',
            status: resetTargetStatus,
            details: {
              source: 'ADMIN_RECOVERY',
              adminUserId: authUser.userId,
              reason: 'Verified with Razorpay that no refund record exists. Safely reset status for re-attempt.',
            },
          }],
          skipDuplicates: true,
        });
      });

      return NextResponse.json({
        success: true,
        message: `Verified with Razorpay: No refund record exists. Payment status safely reset to ${resetTargetStatus}.`,
        data: { paymentId: payment.id, status: resetTargetStatus },
      });
    }

    // 2. Check in-flight status or status checks
    const inFlightAttempt = existingAttempts.find((a) => (IN_FLIGHT_REFUND_STATUSES as readonly string[]).includes(a.status));
    if ((IN_FLIGHT_REFUND_STATUSES as readonly string[]).includes(payment.status) || inFlightAttempt) {
      const targetAttemptId = inFlightAttempt?.id ?? existingAttempts[0]?.id ?? await ensureLegacyAttempt(payment);
      try {
        return await reconcileFromProvider(payment, targetAttemptId);
      } catch {
        await recordAttemptEvent({
          attemptId: targetAttemptId,
          eventType: 'RECONCILIATION_LOOKUP_FAILED',
          status: 'RECONCILIATION_REQUIRED',
          details: { source: 'RAZORPAY_REFUND_LIST', failureReason: 'PROVIDER_LOOKUP_UNAVAILABLE' },
        });
        return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
      }
    }

    // 3. Status check on REFUND_FAILED without action: reconcile from provider
    if (payment.status === 'REFUND_FAILED' && !body?.action) {
      const failedAttempt = existingAttempts.find((a) => a.status === 'REFUND_FAILED') || existingAttempts[0];
      const reconcileAttemptId = failedAttempt?.id ?? await ensureLegacyAttempt(payment);
      try {
        return await reconcileFromProvider(payment, reconcileAttemptId);
      } catch {
        return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
      }
    }

    // 4. Fully refunded payment: cannot refund further
    if (payment.status === 'REFUNDED' || totals.remainingPaise <= 0) {
      if (body?.amount === undefined && !body?.idempotencyKey) {
        const latestRefunded = existingAttempts.find((a) => a.status === 'REFUNDED' && a.razorpayRefundId);
        if (latestRefunded) {
          return responseForRefund('REFUNDED', payment.id, latestRefunded.razorpayRefundId);
        }
      }
      return NextResponse.json({
        success: false,
        message: 'This payment has already been fully refunded. No refundable balance remains.',
        data: { paymentId: payment.id, status: 'REFUNDED' },
      }, { status: 400 });
    }

    // 5. Payment must be in CAPTURED or PARTIALLY_REFUNDED to accept new refunds
    if (payment.status !== 'CAPTURED' && payment.status !== 'PARTIALLY_REFUNDED') {
      return NextResponse.json({
        success: false,
        message: `Only captured or partially refunded payments can be refunded. Current status is "${payment.status}".`,
      }, { status: 409 });
    }

    // 6. Validate requested refund amount
    let requestedPaise: number;
    if (body?.amount !== undefined && body?.amount !== null && body?.amount !== '') {
      const numAmount = Number(body.amount);
      if (!Number.isFinite(numAmount) || numAmount <= 0) {
        return NextResponse.json({ success: false, message: 'Refund amount must be a positive number greater than zero.' }, { status: 400 });
      }
      requestedPaise = Math.round(numAmount * 100);
      if (!Number.isSafeInteger(requestedPaise) || requestedPaise <= 0) {
        return NextResponse.json({ success: false, message: 'Refund amount is invalid.' }, { status: 400 });
      }
      if (requestedPaise > totals.availablePaise) {
        return NextResponse.json({
          success: false,
          message: `Refund amount (₹${numAmount}) exceeds the remaining refundable balance of ₹${totals.remainingAmount}.`,
        }, { status: 400 });
      }
    } else {
      requestedPaise = totals.availablePaise;
      if (requestedPaise <= 0) {
        return NextResponse.json({ success: false, message: 'No refundable balance remains on this payment.' }, { status: 400 });
      }
    }

    // 7. Derive unique attempt ID and idempotency key
    let idempotencyKey: string;
    let attemptId: string;
    if (typeof body?.idempotencyKey === 'string' && body.idempotencyKey.trim()) {
      const customKey = body.idempotencyKey.trim();
      idempotencyKey = refundIdempotencyKey(payment.id, customKey);
      attemptId = refundAttemptId(payment.id, customKey);
    } else if (existingAttempts.length === 0) {
      idempotencyKey = refundIdempotencyKey(payment.id);
      attemptId = refundAttemptId(payment.id);
    } else {
      const suffix = `attempt_${existingAttempts.length + 1}_${randomUUID().slice(0, 8)}`;
      idempotencyKey = refundIdempotencyKey(payment.id, suffix);
      attemptId = refundAttemptId(payment.id, suffix);
    }

    // 8. Idempotent check for identical attempt retry
    const existingSameAttempt = existingAttempts.find((a) => a.id === attemptId);
    if (existingSameAttempt) {
      if (existingSameAttempt.status === 'REFUNDED') {
        return responseForRefund('REFUNDED', payment.id, existingSameAttempt.razorpayRefundId);
      }
      return responseForRefund(existingSameAttempt.status, payment.id, existingSameAttempt.razorpayRefundId);
    }

    let safeFailureReason: string | undefined;
    const workflowResult = await executeRefundWorkflow({
      paymentId: payment.paymentId,
      amountInPaise: requestedPaise,
      idempotencyKey,
    }, {
      claim: async () => db.$transaction(async (tx) => {
        const paymentClaim = await tx.payment.updateMany({
          where: { id: payment!.id, status: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
          data: { status: 'REFUND_PROCESSING' },
        });
        if (paymentClaim.count !== 1) return false;

        const orderClaim = await tx.order.updateMany({
          where: { id: payment!.orderId, paymentStatus: { in: ['CAPTURED', 'PARTIALLY_REFUNDED'] } },
          data: { paymentStatus: 'REFUND_PROCESSING' },
        });
        if (orderClaim.count !== 1) throw new Error('Order payment state changed during refund claim.');

        // Re-verify remaining balance inside transaction to block concurrent races
        const currentAttempts = await tx.refundAttempt.findMany({ where: { paymentId: payment!.id } });
        const currentTotals = calculateRefundTotals(Number(payment!.amount), currentAttempts);
        if (requestedPaise > currentTotals.availablePaise) {
          throw new Error('Concurrent refund attempt exceeded remaining refundable amount.');
        }

        await tx.refundAttempt.create({
          data: {
            id: attemptId,
            orderId: payment!.orderId,
            paymentId: payment!.id,
            amount: requestedPaise / 100,
            status: 'REFUND_PROCESSING',
            events: {
              create: {
                id: refundEventId(attemptId, 'REFUND_REQUESTED'),
                eventType: 'REFUND_REQUESTED',
                status: 'REFUND_PROCESSING',
                details: {
                  source: 'ADMIN_API',
                  providerPaymentId: payment!.paymentId,
                  idempotencyKey,
                  amountPaise: requestedPaise,
                  currency: 'INR',
                  reason: reason || 'Admin initiated refund',
                  requestedByUserId: authUser.userId,
                },
              },
            },
          },
        });
        return true;
      }),
      submit: () => refundRazorpayPayment(payment!.paymentId!, requestedPaise, {
        reason: reason || 'Admin initiated refund',
        adminUserId: authUser.userId,
        payment_record_id: payment!.id,
        orderId: payment!.orderId,
        refund_request_key: idempotencyKey,
        attempt_id: attemptId,
      }, idempotencyKey),
      persist: async (status, refund) => {
        const outcome = await persistAttemptObservation({
          attemptId,
          paymentId: payment!.id,
          orderId: payment!.orderId,
          status,
          eventType: status === 'REFUNDED' ? 'REFUND_PROCESSED' : status === 'REFUND_FAILED' ? 'REFUND_FAILED' : 'REFUND_PENDING',
          source: 'RAZORPAY_API_RESPONSE',
          refund,
          failureReason: status === 'REFUND_FAILED' ? safeFailureReason ?? 'PROVIDER_REJECTED' : undefined,
        });
        if (outcome === 'stale' || outcome === 'duplicate') throw new Error('Refund state was finalized by another authoritative event.');
      },
      markUncertain: async (reasonCode) => {
        await persistAttemptObservation({
          attemptId,
          paymentId: payment!.id,
          orderId: payment!.orderId,
          status: 'REFUND_PENDING_RECONCILIATION',
          eventType: 'REFUND_OUTCOME_UNCERTAIN',
          source: 'RAZORPAY_API_RESPONSE',
          failureReason: reasonCode,
        });
      },
      isDefinitiveRejection: (error) => {
        const rejected = error instanceof RazorpayApiError && error.statusCode >= 400 && error.statusCode < 500 && error.statusCode !== 409;
        if (rejected) safeFailureReason = `PROVIDER_REJECTED_HTTP_${error.statusCode}`;
        return rejected;
      },
    });

    if (workflowResult.kind === 'processed') {
      const remainingAfterRefund = Math.max(0, totals.remainingPaise - requestedPaise) / 100;
      const targetStatus = remainingAfterRefund === 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      return responseForRefund(targetStatus, payment.id, String(workflowResult.refund.id), {
        amountRefunded: requestedPaise / 100,
        remainingRefundableAmount: remainingAfterRefund,
      });
    }
    if (workflowResult.kind === 'pending') {
      return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id, workflowResult.refund?.id as string | undefined);
    }
    if (workflowResult.kind === 'failed') {
      return responseForRefund('REFUND_FAILED', payment.id, workflowResult.refund?.id as string | undefined);
    }
    if (workflowResult.kind === 'rejected') {
      return NextResponse.json({ success: false, message: 'Razorpay rejected the refund request.' }, { status: 422 });
    }
    if (workflowResult.kind === 'persistence-failed') {
      return NextResponse.json({ success: false, message: 'Refund outcome is being reconciled. Do not submit another refund.' }, { status: 503 });
    }
    if (workflowResult.kind === 'claimed-elsewhere') {
      return NextResponse.json({ success: false, message: 'A concurrent refund request was already claimed for this payment.' }, { status: 409 });
    }
    return responseForRefund('REFUND_PENDING_RECONCILIATION', payment.id);
  } catch (error) {
    console.error('[ADMIN_REFUND_ERROR]', { errorType: error instanceof Error ? error.name : 'UnknownError' });
    return NextResponse.json({ success: false, message: 'Refund request could not be completed safely.' }, { status: 500 });
  }
}
