import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRazorpayWebhookSignature } from '@/lib/payments/razorpay';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json({ success: false, message: 'Invalid webhook signature.' }, { status: 400 });
    }

    const body = JSON.parse(rawBody);
    const refundEntity = body.payload?.refund?.entity;
    if (refundEntity?.id && refundEntity.payment_id) {
      const refundRequest = await db.refundRequest.findFirst({
        where: {
          OR: [
            { razorpayRefundId: refundEntity.id },
            { payment: { paymentId: refundEntity.payment_id } },
          ],
        },
        include: { payment: true },
      });
      if (!refundRequest) {
        return NextResponse.json({ success: false, message: 'Refund request is not recognized.' }, { status: 404 });
      }
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
        db.refundRequest.update({
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
      return NextResponse.json({ success: true, status: 'Refund webhook processed.' });
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
    if (payment.status === 'CAPTURED') {
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
        return false;
      }

      await tx.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: nextOrderPaymentStatus },
      });
      return true;
    });

    if (!claimed) {
      return NextResponse.json({ success: true, status: 'Already processed' });
    }

    return NextResponse.json({ success: true, status: 'Webhook processed' });
  } catch {
    return NextResponse.json(
      { success: false, message: 'Webhook processing failed.' },
      { status: 500 },
    );
  }
}
