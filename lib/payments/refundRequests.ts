import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  RazorpayRefundError,
  refundRazorpayPayment,
} from '@/lib/payments/razorpay';

export const REFUND_REQUEST_STATUSES = [
  'PENDING_ADMIN_REVIEW',
  'APPROVED',
  'REJECTED',
  'REFUND_PROCESSING',
  'REFUNDED',
  'REFUND_FAILED',
  'REFUND_STATUS_UNKNOWN',
] as const;

export type RefundRequestStatus = (typeof REFUND_REQUEST_STATUSES)[number];

export async function createRefundRequestForCapturedPayment(
  tx: Prisma.TransactionClient,
  orderId: string,
  requestedByUserId: string,
) {
  const existing = await tx.refundRequest.findUnique({
    where: { orderId },
  });
  if (existing) return existing;

  const payment = await tx.payment.findFirst({
    where: {
      orderId,
      direction: 'CUSTOMER_PAYS',
      status: 'CAPTURED',
      paymentId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment || !payment.paymentId) return null;

  return tx.refundRequest.create({
    data: {
      orderId,
      paymentId: payment.id,
      requestedByUserId,
      amount: payment.amount,
      status: 'PENDING_ADMIN_REVIEW',
    },
  });
}

function isUncertainRefundError(error: unknown) {
  return error instanceof RazorpayRefundError
    ? error.uncertain
    : error instanceof Error &&
      /abort|timeout|network|fetch|socket|econn/i.test(error.message);
}

export async function processApprovedRefund(
  refundRequestId: string,
  reviewerId: string,
  action: 'approve' | 'reject' | 'retry',
  reason?: string,
) {
  const reviewReason = reason?.trim().slice(0, 500) || null;

  if (action === 'reject') {
    const result = await db.refundRequest.updateMany({
      where: { id: refundRequestId, status: 'PENDING_ADMIN_REVIEW' },
      data: {
        status: 'REJECTED',
        reviewedByUserId: reviewerId,
        reviewedAt: new Date(),
        reviewReason,
      },
    });
    if (result.count !== 1) {
      throw new Error('Refund request is no longer awaiting review.');
    }
    return db.refundRequest.findUnique({ where: { id: refundRequestId } });
  }

  const allowedStatuses =
    action === 'retry'
      ? ['REFUND_FAILED']
      : ['PENDING_ADMIN_REVIEW'];

  const claimed = await db.refundRequest.updateMany({
    where: {
      id: refundRequestId,
      status: { in: allowedStatuses },
    },
    data: {
      status: 'REFUND_PROCESSING',
      reviewedByUserId: reviewerId,
      reviewedAt: new Date(),
      reviewReason,
      failureReason: null,
    },
  });
  if (claimed.count !== 1) {
    throw new Error('Refund request is already being processed or completed.');
  }

  const request = await db.refundRequest.findUnique({
    where: { id: refundRequestId },
    include: { payment: true },
  });
  if (!request?.payment.paymentId) {
    await db.refundRequest.update({
      where: { id: refundRequestId },
      data: {
        status: 'REFUND_FAILED',
        failureReason: 'The captured payment has no Razorpay payment ID.',
      },
    });
    throw new Error('The captured payment has no Razorpay payment ID.');
  }

  try {
    const refund = await refundRazorpayPayment(
      request.payment.paymentId,
      Math.round(request.amount * 100),
      {
        reason: reviewReason || 'Admin-approved order cancellation refund',
        refundRequestId,
        orderId: request.orderId,
      },
    );

    if (refund.status !== 'processed') {
      await db.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REFUND_STATUS_UNKNOWN',
          razorpayRefundId: refund.id,
          failureReason: `Razorpay refund status is ${refund.status || 'unknown'}.`,
        },
      });
      throw new RazorpayRefundError(
        'Razorpay accepted the refund but has not confirmed it as processed.',
        true,
      );
    }

    return db.$transaction(async (tx) => {
      await tx.refundRequest.update({
        where: { id: refundRequestId },
        data: {
          status: 'REFUNDED',
          razorpayRefundId: refund.id,
          failureReason: null,
        },
      });
      await tx.payment.update({
        where: { id: request.paymentId },
        data: { status: 'REFUNDED' },
      });
      await tx.order.update({
        where: { id: request.orderId },
        data: { paymentStatus: 'REFUNDED' },
      });
      return tx.refundRequest.findUnique({ where: { id: refundRequestId } });
    });
  } catch (error) {
    const status = isUncertainRefundError(error)
      ? 'REFUND_STATUS_UNKNOWN'
      : 'REFUND_FAILED';
    const message = error instanceof Error ? error.message : 'Refund failed.';
    await db.refundRequest.update({
      where: { id: refundRequestId },
      data: { status, failureReason: message },
    });
    throw error;
  }
}
