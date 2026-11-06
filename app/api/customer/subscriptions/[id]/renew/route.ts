import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { purchaseSubscriptionWithWallet } from '@/lib/subscriptions';
import { createRazorpayOrder, RazorpayOrderCreationError } from '@/lib/payments/razorpay';

export const runtime = 'nodejs';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json(
      { success: false, message: 'Authenticated customer access is required.' },
      { status: 401 },
    );
  }

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const paymentMethod = body.paymentMethod === 'WALLET' ? 'WALLET' : 'RAZORPAY';

    const sub = await db.customerSubscription.findUnique({
      where: { id },
      include: { offer: true },
    });

    if (!sub || sub.customerId !== authUser.customerId) {
      return NextResponse.json(
        { success: false, message: 'Subscription not found.' },
        { status: 404 },
      );
    }

    if (!sub.offer.active) {
      return NextResponse.json(
        { success: false, message: 'This subscription plan is no longer active for renewal.' },
        { status: 400 },
      );
    }

    if (paymentMethod === 'WALLET') {
      const result = await db.$transaction((tx) =>
        purchaseSubscriptionWithWallet(tx, {
          customerId: authUser.customerId!,
          offerId: sub.offerId,
        }),
      );

      return NextResponse.json({
        success: true,
        message: 'Subscription renewed successfully using your wallet balance.',
        data: result.subscription,
      });
    }

    // Razorpay renewal flow
    const payment = await db.subscriptionPayment.create({
      data: {
        customerId: authUser.customerId,
        offerId: sub.offerId,
        amount: sub.offer.price,
        paymentMethod: 'RAZORPAY',
        status: 'PENDING',
      },
    });

    try {
      const razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(sub.offer.price * 100),
        receipt: `sub-renew-${payment.id}`,
        notes: {
          purpose: 'subscription_renewal',
          customerId: authUser.customerId,
          subscriptionId: sub.id,
          offerId: sub.offerId,
          paymentId: payment.id,
        },
      });

      const updated = await db.subscriptionPayment.update({
        where: { id: payment.id },
        data: { gatewayOrderId: razorpayOrder.id },
      });

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
      await db.subscriptionPayment.update({
        where: { id: payment.id },
        data: { status: 'FAILED', failureReason: 'Unable to initiate gateway renewal order.' },
      });
      if (error instanceof RazorpayOrderCreationError) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
      }
      throw error;
    }
  } catch (error) {
    console.error('Subscription renewal failed:', error);
    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unable to renew subscription.',
      },
      { status: 400 },
    );
  }
}
