import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { PaymentVerificationError, verifyAndRecordPayment } from '@/lib/payments/verification';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();
    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json({ success: false, message: 'Payment verification fields are required.' }, { status: 400 });
    }

    const updated = await verifyAndRecordPayment({
      orderId,
      razorpayOrderId: razorpay_order_id,
      razorpayPaymentId: razorpay_payment_id,
      razorpaySignature: razorpay_signature,
      customerId: authUser.customerId,
    });
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    const status = error instanceof PaymentVerificationError ? error.statusCode : 500;
    return NextResponse.json({ success: false, message: error.message || 'Payment verification failed.' }, { status });
  }
}