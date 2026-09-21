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

    await db.$transaction([
      db.payment.update({
        where: { id: payment.id },
        data: { paymentId: providerPaymentId, signature, status: nextStatus },
      }),
      db.order.update({ where: { id: payment.orderId }, data: { paymentStatus: nextOrderPaymentStatus } }),
    ]);

    return NextResponse.json({ success: true, status: 'Webhook processed' });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
