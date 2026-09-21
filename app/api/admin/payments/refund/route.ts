import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { refundRazorpayPayment } from '@/lib/payments/razorpay';

export async function POST(req: NextRequest) {
  let payment: any = null;
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { paymentRecordId, reason } = await req.json().catch(() => ({}));

    if (!paymentRecordId || typeof paymentRecordId !== 'string') {
      return NextResponse.json({ success: false, message: 'Payment record ID is required.' }, { status: 400 });
    }

    // Locate the target payment record
    payment = await db.payment.findUnique({
      where: { id: paymentRecordId },
      include: { order: true },
    });

    if (!payment) {
      // Fallback search by orderId or gateway paymentId
      const cleanId = paymentRecordId.startsWith('pay-') ? paymentRecordId.replace('pay-', '') : paymentRecordId;
      payment = await db.payment.findFirst({
        where: {
          OR: [
            { id: cleanId },
            { orderId: cleanId },
            { paymentId: cleanId },
          ],
        },
        include: { order: true },
      });
    }

    if (!payment) {
      return NextResponse.json({
        success: false,
        message: 'Payment record not found in database.',
      }, { status: 404 });
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

    // Update payment record in database to REFUNDED
    const updatedPayment = await db.payment.update({
      where: { id: payment.id },
      data: { status: 'REFUNDED' },
    });

    // Update associated order paymentStatus to REFUNDED
    if (payment.orderId) {
      await db.order.update({
        where: { id: payment.orderId },
        data: { paymentStatus: 'REFUNDED' },
      }).catch((e) => console.error('Order paymentStatus update error:', e));
    }

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

    const errorMsg = (error?.message || '').toLowerCase();
    const isAlreadyRefundedError =
      errorMsg.includes('already refunded') ||
      errorMsg.includes('fully refunded') ||
      errorMsg.includes('exceeds the payment amount') ||
      errorMsg.includes('exceeds the maximum refundable');

    if (isAlreadyRefundedError && payment) {
      try {
        await db.payment.update({
          where: { id: payment.id },
          data: { status: 'REFUNDED' },
        });
        if (payment.orderId) {
          await db.order.update({
            where: { id: payment.orderId },
            data: { paymentStatus: 'REFUNDED' },
          }).catch(() => {});
        }
        return NextResponse.json({
          success: true,
          message: 'Payment was already refunded on Razorpay. Synced local record status to REFUNDED.',
          data: {
            paymentId: payment.id,
            status: 'REFUNDED',
          },
        });
      } catch (dbErr) {
        console.error('Reconciliation error:', dbErr);
      }
    }

    return NextResponse.json({
      success: false,
      message: error.message || 'Server error processing Razorpay refund.',
    }, { status: 500 });
  }
}
