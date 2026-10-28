import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import {
  refundRazorpayPayment,
  verifyRazorpayWebhookSignature,
} from '@/lib/payments/razorpay';
import { dispatchPaidOrderToAgents } from '@/lib/payments/verification';
import { dispatchCapturedPayment } from '@/lib/payments/webhookDispatch';
import {
  getSafeErrorDependency,
  getSafeErrorType,
  logStructured,
  withApiRequestLogging,
  type ApiRequestContext,
} from '@/lib/observability/structuredLogger';
import {
  applyRefundEventOnce,
  refundAttemptId,
  refundEventId,
  refundIdempotencyKey,
  refundStatusFromProviderStatus,
  isRefundResultForRequest,
} from '@/lib/payments/refundWorkflow';

async function refundLateCapturedPayment(payment: {
  id: string;
  orderId: string;
  amount: number;
  paymentId: string;
}) {
  const attemptId = refundAttemptId(payment.id);
  const idempotencyKey = refundIdempotencyKey(payment.id);
  let nextStatus: 'REFUNDED' | 'REFUND_PENDING' | 'REFUND_FAILED' | 'REFUND_PENDING_RECONCILIATION';
  let refund: any = null;

  try {
    refund = await refundRazorpayPayment(
      payment.paymentId,
      Math.round(payment.amount * 100),
      {
        reason: 'Automatic refund for payment captured after cancellation',
        orderId: payment.orderId,
        payment_record_id: payment.id,
        refund_request_key: idempotencyKey,
        attempt_id: attemptId,
      },
      idempotencyKey,
    );
    if (!isRefundResultForRequest(refund, {
      paymentId: payment.paymentId,
      amountInPaise: Math.round(payment.amount * 100),
      idempotencyKey,
    })) {
      nextStatus = 'REFUND_PENDING_RECONCILIATION';
    } else if (refund.status === 'processed') {
      nextStatus = 'REFUNDED';
    } else if (refund.status === 'pending') {
      nextStatus = 'REFUND_PENDING';
    } else {
      nextStatus = 'REFUND_FAILED';
    }
  } catch (error: any) {
    nextStatus = error?.uncertain ? 'REFUND_PENDING_RECONCILIATION' : 'REFUND_FAILED';
  }

  await db.$transaction(async (tx) => {
    await (tx as any).refundAttempt.updateMany({
      where: { id: attemptId, status: { in: ['REFUND_PROCESSING', 'RECONCILIATION_REQUIRED'] } },
      data: {
        status: nextStatus,
        ...(typeof refund?.id === 'string' ? { razorpayRefundId: refund.id } : {}),
        failureReason: nextStatus === 'REFUNDED' ? null : `Late-capture refund status: ${nextStatus}`,
      },
    });
    await tx.payment.updateMany({
      where: { id: payment.id, status: { in: ['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION'] } },
      data: { status: nextStatus },
    });
    await tx.order.updateMany({
      where: { id: payment.orderId, paymentStatus: { in: ['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION'] } },
      data: { paymentStatus: nextStatus },
    });
    await (tx as any).refundAttemptEvent.createMany({
      data: [{
        id: refundEventId(attemptId, `LATE_CAPTURE_REFUND_${nextStatus}`),
        refundAttemptId: attemptId,
        eventType: 'LATE_CAPTURE_REFUND_RESULT',
        status: nextStatus,
        details: {
          providerRefundId: refund?.id || null,
          providerStatus: refund?.status || null,
        },
      }],
      skipDuplicates: true,
    });
  });
  return nextStatus;
}

async function handlePost(req: NextRequest, context: ApiRequestContext) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ success: false, message: 'Invalid webhook signature.' }, { status: 400 });
    }

    const body = JSON.parse(rawBody);

    const refundEntity = body.payload?.refund?.entity;
    if (refundEntity?.id && refundEntity.payment_id) {
      if ((db as any).refundRequest) {
        let refundRequest: any = null;
        try {
          refundRequest = await (db as any).refundRequest.findFirst({
            where: {
              OR: [
                { razorpayRefundId: refundEntity.id },
                { payment: { paymentId: refundEntity.payment_id } },
              ],
            },
            include: { payment: true },
          });
        } catch {
          refundRequest = null;
        }

        if (refundRequest) {
          if (refundRequest.status === 'REFUNDED') {
            return NextResponse.json({ success: true, status: 'Refund already reconciled.' });
          }
          if (!['REFUND_PROCESSING', 'REFUND_STATUS_UNKNOWN'].includes(refundRequest.status)) {
            return NextResponse.json({ success: false, message: 'Refund request was not approved for processing.' }, { status: 409 });
          }

          const refundProcessed = body.event === 'refund.processed';
          const refundFailed = body.event === 'refund.failed';
          if (!refundProcessed && !refundFailed) {
            return NextResponse.json({ success: true, status: 'Refund event ignored.' });
          }
          if (
            refundEntity.payment_id !== refundRequest.payment.paymentId ||
            refundEntity.currency !== 'INR' ||
            Number(refundEntity.amount) !== Math.round(refundRequest.amount * 100)
          ) {
            return NextResponse.json({ success: false, message: 'Refund webhook does not match the local refund request.' }, { status: 409 });
          }

          await db.$transaction([
            (db as any).refundRequest.update({
              where: { id: refundRequest.id },
              data: {
                status: refundProcessed ? 'REFUNDED' : 'REFUND_FAILED',
                razorpayRefundId: refundEntity.id,
                failureReason: refundFailed ? String(refundEntity.error_description || 'Razorpay reported refund failure.') : null,
              },
            }),
            db.payment.update({
              where: { id: refundRequest.paymentId },
              data: { status: refundProcessed ? 'REFUNDED' : refundRequest.payment.status },
            }),
            ...(refundProcessed
              ? [db.order.update({
                  where: { id: refundRequest.orderId },
                  data: { paymentStatus: 'REFUNDED' },
                })]
              : []),
          ]);
          if (refundFailed) {
            logStructured('warn', 'payment.provider.refund_failed', {
              ...context,
              dependency: 'razorpay',
            });
          }
          return NextResponse.json({ success: true, status: 'Refund webhook processed.' });
        }
      }

      const refund = refundEntity;
      const providerPaymentId = refund?.payment_id;
      const refundId = refund?.id;
      const refundKey = refund?.notes?.refund_request_key;
      if (!providerPaymentId || !refundId || typeof refundKey !== 'string') {
        return NextResponse.json({ success: false, message: 'Refund webhook identifiers are missing.' }, { status: 400 });
      }

      const payment = await db.payment.findFirst({
        where: { paymentId: providerPaymentId, direction: 'CUSTOMER_PAYS', gateway: 'RAZORPAY' },
      });
      if (!payment || (refundKey !== refundIdempotencyKey(payment.id) && !refundKey.startsWith('jio_refund_'))) {
        return NextResponse.json({ success: true, status: 'Refund event ignored.' });
      }
      const refundAmountPaise = Number(refund.amount);
      const paymentTotalPaise = Math.round(payment.amount * 100);
      if (refundKey === refundIdempotencyKey(payment.id)) {
        if (refund.currency !== 'INR' || refundAmountPaise !== paymentTotalPaise) {
          return NextResponse.json({ success: false, message: 'Refund webhook amount does not match the local payment.' }, { status: 400 });
        }
      } else {
        if (refund.currency !== 'INR' || !Number.isSafeInteger(refundAmountPaise) || refundAmountPaise <= 0 || refundAmountPaise > paymentTotalPaise) {
          return NextResponse.json({ success: false, message: 'Refund webhook amount does not match the local payment.' }, { status: 400 });
        }
      }

      if (
        (body.event === 'refund.failed' && refund.status !== 'failed') ||
        (body.event === 'refund.processed' && refund.status !== 'processed')
      ) {
        return NextResponse.json({ success: false, message: 'Refund webhook event and status do not match.' }, { status: 400 });
      }
      const refundStatus = refund.status === 'failed'
        ? refundStatusFromProviderStatus('failed')
        : refundStatusFromProviderStatus(refund.status);
      if (!refundStatus) {
        return NextResponse.json({ success: true, status: 'Refund event status ignored.' });
      }

      const webhookResponse = await db.$transaction(async (tx) => {
        const attemptIdFromNotes = refund?.notes?.attempt_id;
        let attempt: any = null;
        if (typeof attemptIdFromNotes === 'string' && attemptIdFromNotes.trim()) {
          attempt = await (tx as any).refundAttempt.findUnique({ where: { id: attemptIdFromNotes.trim() } });
        }
        if (!attempt && refundId) {
          attempt = await (tx as any).refundAttempt.findUnique({ where: { razorpayRefundId: refundId } });
        }
        if (!attempt) {
          const defaultAttemptId = refundAttemptId(payment.id);
          attempt = await (tx as any).refundAttempt.findUnique({ where: { id: defaultAttemptId } });
        }
        if (!attempt) {
          const attempts = await (tx as any).refundAttempt.findMany({
            where: { paymentId: payment.id },
          });
          attempt = attempts.find((a: any) =>
            Math.round(Number(a.amount) * 100) === refundAmountPaise &&
            ['REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION', 'RECONCILIATION_REQUIRED', 'PENDING', 'PROCESSING'].includes(a.status)
          ) || null;
        }
        if (!attempt) {
          const defaultAttemptId = refundAttemptId(payment.id);
          await (tx as any).refundAttempt.createMany({
            data: [{
              id: defaultAttemptId,
              orderId: payment.orderId,
              paymentId: payment.id,
              amount: payment.amount,
              status: 'RECONCILIATION_REQUIRED',
            }],
            skipDuplicates: true,
          });
          attempt = await (tx as any).refundAttempt.findUnique({ where: { id: defaultAttemptId } });
        }
        if (!attempt) throw new Error('Refund attempt could not be loaded.');

        if (Math.round(Number(attempt.amount) * 100) !== refundAmountPaise) {
          return NextResponse.json({ success: false, message: 'Refund webhook amount does not match the refund attempt.' }, { status: 400 });
        }

        const attemptId = attempt.id;
        const providerEventId = req.headers.get('x-razorpay-event-id');
        const eventIdentity = providerEventId
          ? `provider-event:${providerEventId}`
          : `fallback:${body.event}:${refundId}:${refund.status}`;
        const eventDetails = {
          source: 'RAZORPAY_WEBHOOK',
          ...(providerEventId ? { providerEventId } : {}),
          event: body.event,
          providerRefundId: refundId,
          providerPaymentId,
          providerStatus: refund.status,
          amountPaise: Number(refund.amount),
          currency: refund.currency,
        };
        await applyRefundEventOnce({
          currentStatus: attempt.status,
          nextStatus: refundStatus,
          recordEvent: async () => {
            const created = await (tx as any).refundAttemptEvent.createMany({
              data: [{
                id: refundEventId(attemptId, eventIdentity),
                refundAttemptId: attemptId,
                eventType: body.event,
                status: refundStatus,
                details: eventDetails,
              }],
              skipDuplicates: true,
            });
            return created.count === 1;
          },
          persistStatus: async () => {
            const mutableAttemptStatuses = ['PENDING', 'PROCESSING', 'RECONCILIATION_REQUIRED', 'REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION'];
            const attemptUpdate = await (tx as any).refundAttempt.updateMany({
              where: { id: attemptId, status: { in: mutableAttemptStatuses } },
              data: {
                status: refundStatus,
                razorpayRefundId: refundId,
                failureReason: refundStatus === 'REFUND_FAILED' ? 'PROVIDER_REPORTED_FAILED' : null,
              },
            });
            if (attemptUpdate.count === 0) {
              const latestAttempt = await (tx as any).refundAttempt.findUnique({ where: { id: attemptId }, select: { status: true } });
              if (!latestAttempt || latestAttempt.status !== refundStatus) return;
            }

            const latestPayment = await tx.payment.findUnique({ where: { id: payment.id }, select: { status: true } });
            const latestOrder = await tx.order.findUnique({ where: { id: payment.orderId }, select: { paymentStatus: true } });
            if (!latestPayment || !latestOrder) throw new Error('Refund payment or order record is missing.');

            const allAttempts = await (tx as any).refundAttempt.findMany({
              where: { paymentId: payment.id },
              select: { id: true, amount: true, status: true },
            });
            let settledPaise = 0;
            for (const a of allAttempts) {
              const effectiveStatus = a.id === attemptId ? refundStatus : a.status;
              if (effectiveStatus === 'REFUNDED') {
                settledPaise += Math.round(Number(a.amount) * 100);
              }
            }

            let targetStatus: string;
            if (refundStatus === 'REFUNDED') {
              targetStatus = settledPaise >= paymentTotalPaise ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
            } else if (refundStatus === 'REFUND_FAILED') {
              targetStatus = settledPaise > 0 ? 'PARTIALLY_REFUNDED' : 'REFUND_FAILED';
            } else {
              targetStatus = refundStatus;
            }

            if (latestPayment.status === 'REFUNDED' && targetStatus !== 'REFUNDED') return;
            const allowedStatuses = ['CAPTURED', 'PARTIALLY_REFUNDED', 'REFUND_PROCESSING', 'REFUND_PENDING', 'REFUND_PENDING_RECONCILIATION', 'REFUND_FAILED'];
            if (latestPayment.status !== targetStatus && !allowedStatuses.includes(latestPayment.status)) {
              throw new Error('Payment status changed during refund reconciliation.');
            }
            if (latestOrder.paymentStatus !== targetStatus && !allowedStatuses.includes(latestOrder.paymentStatus)) {
              throw new Error('Order payment status could not be reconciled.');
            }
            const paymentWrite = await tx.payment.updateMany({
              where: { id: payment.id, status: { in: allowedStatuses } },
              data: { status: targetStatus },
            });
            if (paymentWrite.count === 0 && latestPayment.status !== targetStatus) {
              throw new Error('Payment status changed during refund reconciliation.');
            }
            const orderWrite = await tx.order.updateMany({
              where: { id: payment.orderId, paymentStatus: { in: allowedStatuses } },
              data: { paymentStatus: targetStatus },
            });
            if (orderWrite.count === 0 && latestOrder.paymentStatus !== targetStatus) {
              throw new Error('Order payment status could not be reconciled.');
            }
          },
        });
        return NextResponse.json({ success: true, status: 'Refund event processed.' });
      });
      if (refundStatus === 'REFUND_FAILED') {
        logStructured('warn', 'payment.provider.refund_failed', {
          ...context,
          dependency: 'razorpay',
        });
      }
      return webhookResponse;
    }

    const entity = body.payload?.payment?.entity;
    const gatewayOrderId = entity?.order_id;
    const providerPaymentId = entity?.id;
    if (!gatewayOrderId || !providerPaymentId) {
      return NextResponse.json({ success: false, message: 'Webhook payment identifiers are missing.' }, { status: 400 });
    }

    const payment = await db.payment.findFirst({ where: { gatewayOrderId, direction: 'CUSTOMER_PAYS' } });
    if (!payment) {
      return NextResponse.json({ success: false, message: 'Payment order is not recognized.' }, { status: 404 });
    }

    if (entity.currency !== 'INR' || Number(entity.amount) !== Math.round(payment.amount * 100)) {
      return NextResponse.json({ success: false, message: 'Webhook payment amount does not match the local payment.' }, { status: 400 });
    }

    const reusedPayment = await db.payment.findFirst({
      where: { paymentId: providerPaymentId, id: { not: payment.id } },
    });
    if (reusedPayment) {
      return NextResponse.json({ success: false, message: 'Razorpay payment ID has already been used.' }, { status: 409 });
    }

    const failed = body.event === 'payment.failed';
    const authorized = body.event === 'payment.authorized';
    const captured = body.event === 'payment.captured';
    if (!failed && !authorized && !captured) {
      return NextResponse.json({ success: true, status: 'Event ignored' });
    }
    if (payment.status === 'REFUNDED') {
      return NextResponse.json({ success: true, status: 'Payment is already REFUNDED. Event ignored.' });
    }
    if (payment.status.startsWith('REFUND_')) {
      return NextResponse.json({ success: true, status: 'Refund reconciliation is in progress. Payment event ignored.' });
    }
    if (payment.status === 'CAPTURED') {
      // Provider retries can also recover dispatch after the process handling
      // the original capture stopped between the DB commit and dispatch.
      await dispatchCapturedPayment(payment.status, payment.orderId, dispatchPaidOrderToAgents);
      return NextResponse.json({ success: true, status: 'Already processed' });
    }

    const nextStatus = failed ? 'FAILED' : authorized ? 'AUTHORIZED' : 'CAPTURED';
    const nextOrderPaymentStatus = failed ? 'FAILED' : authorized ? 'AUTHORIZED' : 'CAPTURED';

    const claimed = await db.$transaction(async (tx) => {
      const paymentClaim = await tx.payment.updateMany({
        where: {
          id: payment.id,
          status: { in: ['PENDING', 'INITIATED', 'AUTHORIZED'] },
        },
        data: {
          paymentId: providerPaymentId,
          signature,
          status: nextStatus,
        },
      });

      if (paymentClaim.count !== 1) {
        return { claimed: false, lateCapture: false };
      }

      const currentOrder = await tx.order.findUnique({
        where: { id: payment.orderId },
        select: { status: true },
      });
      if (captured && currentOrder?.status === 'CANCELLED') {
        const attemptId = refundAttemptId(payment.id);
        await tx.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUND_PROCESSING' },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: 'REFUND_PROCESSING' },
        });
        await (tx as any).refundAttempt.createMany({
          data: [{
            id: attemptId,
            orderId: payment.orderId,
            paymentId: payment.id,
            amount: payment.amount,
            status: 'REFUND_PROCESSING',
          }],
          skipDuplicates: true,
        });
        await (tx as any).refundAttemptEvent.createMany({
          data: [{
            id: refundEventId(attemptId, 'LATE_CAPTURE_DETECTED'),
            refundAttemptId: attemptId,
            eventType: 'LATE_CAPTURE_DETECTED',
            status: 'REFUND_PROCESSING',
            details: { providerPaymentId, source: 'RAZORPAY_WEBHOOK' },
          }],
          skipDuplicates: true,
        });
        return { claimed: true, lateCapture: true };
      }

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: nextOrderPaymentStatus },
      });
      return { claimed: true, lateCapture: false };
    });

    if (!claimed.claimed) {
      return NextResponse.json({ success: true, status: 'Already processed' });
    }

    if (failed) {
      logStructured('warn', 'payment.provider.failed', {
        ...context,
        dependency: 'razorpay',
      });
    }

    if (claimed.lateCapture) {
      const lateRefundStatus = await refundLateCapturedPayment({
        id: payment.id,
        orderId: payment.orderId,
        amount: payment.amount,
        paymentId: providerPaymentId,
      });
      return NextResponse.json({ success: true, status: `Late capture refund ${lateRefundStatus}.` });
    }

    await dispatchCapturedPayment(nextStatus, payment.orderId, dispatchPaidOrderToAgents);

    return NextResponse.json({ success: true, status: 'Webhook processed' });
  } catch (error: any) {
    logStructured('error', 'payment.webhook.failed', {
      ...context,
      dependency: getSafeErrorDependency(error),
      errorType: getSafeErrorType(error),
    });
    return NextResponse.json(
      { success: false, message: 'Webhook processing failed.' },
      { status: 500 },
    );
  }
}

export const POST = withApiRequestLogging('/api/payments/webhook', handlePost);
