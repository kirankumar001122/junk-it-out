import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { createRazorpayOrder, RazorpayOrderCreationError } from '@/lib/payments/razorpay';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const offerId = typeof body.offerId === 'string' ? body.offerId : '';
    const offer = await db.subscriptionOffer.findFirst({ where: { id: offerId, active: true } });
    if (!offer) return NextResponse.json({ success: false, message: 'Subscription offer is unavailable.' }, { status: 404 });

    const payment = await db.subscriptionPayment.create({
      data: { customerId: authUser.customerId, offerId: offer.id, amount: offer.price },
    });
    try {
      const razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(offer.price * 100),
        receipt: `subscription-${payment.id}`,
        notes: { purpose: 'subscription_purchase', customerId: authUser.customerId, offerId: offer.id, paymentId: payment.id },
      });
      const updated = await db.subscriptionPayment.update({ where: { id: payment.id }, data: { gatewayOrderId: razorpayOrder.id } });
      return NextResponse.json({
        success: true,
        data: {
          paymentId: updated.id,
          gatewayOrderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: razorpayOrder.keyId,
        },
      });
    } catch (error) {
      await db.subscriptionPayment.update({ where: { id: payment.id }, data: { status: 'FAILED', failureReason: 'Unable to create payment order.' } });
      if (error instanceof RazorpayOrderCreationError) return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
      throw error;
    }
  } catch (error) {
    console.error('Subscription purchase creation failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to start subscription payment.' }, { status: 500 });
  }
}
