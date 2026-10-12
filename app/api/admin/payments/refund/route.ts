import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { refundRazorpayPayment } from '@/lib/payments/razorpay';

export async function POST(req: NextRequest) {
  let payment: any = null;
  let refundReserved = false;
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { paymentRecordId, reason } = await req.json().catch(() => ({}));

    if (!paymentRecordId || typeof paymentRecordId !== 'string') {
      return NextResponse.json({ success: false, message: 'Payment record ID is required.' }, { status: 400 });
    }

    // Refunds are addressed by the local payment record ID only. An order ID
    // or provider ID is ambiguous when an order has more than one payment.
    payment = await db.payment.findUnique({
      where: { id: paymentRecordId },
      include: { order: true },
    });

    if (!payment) {
      return NextResponse.json({
        success: false,
        message: 'Payment record not found in database.',
      }, { status: 404 });
    }

    if (payment.gateway !== 'RAZORPAY' || payment.direction !== 'CUSTOMER_PAYS') {
      return NextResponse.json({ success: false, message: 'Only customer payments through Razorpay can be refunded here.' }, { status: 400 });
    }

    // Idempotency check: strictly require CAPTURED status
    if (payment.status !== 'CAPTURED') {
      if (payment.status === 'REFUNDED') {
        return NextResponse.json({
          success: false,
          message: 'Payment has already been refunded.',
        }, { status: 400 });
      }
      return NextResponse.json({
        success: false,
        message: `Only CAPTURED payments can be refunded. Current payment status is "${payment.status}".`,
      }, { status: 400 });
    }

    const rzpPaymentId = payment.paymentId;
    if (!rzpPaymentId || rzpPaymentId === 'N/A') {
      return NextResponse.json({
        success: false,
        message: 'No Razorpay payment ID (pay_xxx) found for this transaction.',
      }, { status: 400 });
    }

    const amountInPaise = Math.round(payment.amount * 100);

    // Reserve the captured payment atomically so concurrent admin requests
    // cannot submit duplicate refunds. A failed/ambiguous provider request
    // stays REFUNDING for reconciliation instead of risking a second refund.
    const reserved = await db.$transaction(async (tx) => {
      const reservation = await tx.payment.updateMany({
        where: { id: payment.id, status: 'CAPTURED', gateway: 'RAZORPAY', direction: 'CUSTOMER_PAYS' },
        data: { status: 'REFUNDING' },
      });
      if (reservation.count !== 1) return false;
      const orderReservation = await tx.order.updateMany({
        where: { id: payment.orderId, paymentStatus: { in: ['CAPTURED', 'REFUND_REQUIRED'] } },
        data: { paymentStatus: 'REFUNDING' },
      });
      if (orderReservation.count !== 1) throw new Error('Order payment state changed before refund reservation.');
      return true;
    });
    if (!reserved) {
      return NextResponse.json({ success: false, message: 'Payment status changed; refresh and review it before retrying.' }, { status: 409 });
    }
    refundReserved = true;

    // Call server-side Razorpay REST API
    const refundResult = await refundRazorpayPayment(
      rzpPaymentId,
      amountInPaise,
      {
        reason: reason || 'Admin initiated refund',
        adminUserId: authUser.userId,
        orderId: payment.orderId,
      }
    );

    const updatedPayment = await db.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: { id: payment.id, status: 'REFUNDING' },
        data: { status: 'REFUNDED' },
      });
      if (updated.count !== 1) throw new Error('Refund record changed before reconciliation.');
      await tx.order.updateMany({
        where: { id: payment.orderId, paymentStatus: 'REFUNDING' },
        data: { paymentStatus: 'REFUNDED' },
      });
      return tx.payment.findUnique({ where: { id: payment.id } });
    });

    return NextResponse.json({
      success: true,
      message: `Successfully refunded ₹${payment.amount} via Razorpay.`,
      data: {
        paymentId: updatedPayment.id,
        status: updatedPayment.status,
        razorpayRefundId: refundResult.id,
      },
    });
  } catch (error: any) {
    console.error('Admin payment refund error:', error);

    return NextResponse.json({
      success: false,
      message: refundReserved
        ? 'Refund result could not be confirmed. Payment is held for reconciliation; do not retry it yet.'
        : 'Unable to process the refund request. Review the payment record and try again.',
    }, { status: 500 });
  }
}
