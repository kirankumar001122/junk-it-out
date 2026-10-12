import { NextRequest, NextResponse } from 'next/server';
import { PaymentVerificationError, verifyAndRecordPayment } from '@/lib/payments/verification';

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const orderId = String(form.get('razorpay_order_id') || '');
    const paymentId = String(form.get('razorpay_payment_id') || '');
    const signature = String(form.get('razorpay_signature') || '');
    if (!orderId || !paymentId || !signature) {
      return NextResponse.json({ success: false, message: 'Payment callback fields are required.' }, { status: 400 });
    }

    const result = await verifyAndRecordPayment({
      orderId: '',
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: signature,
    });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
    const redirectUrl = new URL(`/orders/${result.orderId}`, appUrl);
    redirectUrl.searchParams.set('payment', result.status === 'CAPTURED' ? 'success' : 'processing');
    return NextResponse.redirect(redirectUrl);
  } catch (error: any) {
    const status = error instanceof PaymentVerificationError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: error.message || 'Payment callback failed.' }, { status });
  }
}