import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { fetchRazorpayPayment, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';
import { calculateSubscriptionExpiry } from '@/lib/subscriptions';

export const runtime = 'nodejs';

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }
  try {
    const body = await req.json();
    const paymentId = typeof body.paymentId === 'string' ? body.paymentId : '';
    const razorpayOrderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const razorpayPaymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const razorpaySignature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const paymentRecord = await db.subscriptionPayment.findFirst({
      where: { id: paymentId, customerId: authUser.customerId },
      include: { offer: true },
    });
    if (!paymentRecord || !paymentRecord.gatewayOrderId || paymentRecord.gatewayOrderId !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: 'Subscription payment was not found.' }, { status: 404 });
    }
    if (paymentRecord.status === 'SUCCESS') {
      const existing = await db.customerSubscription.findUnique({ where: { paymentId: paymentRecord.id } });
      return NextResponse.json({ success: true, alreadyProcessed: true, data: existing });
    }
    if (!verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      await db.subscriptionPayment.update({ where: { id: paymentRecord.id }, data: { status: 'FAILED', failureReason: 'Invalid payment signature.' } });
      return NextResponse.json({ success: false, message: 'Payment signature verification failed.' }, { status: 400 });
    }
    const gatewayPayment = await fetchRazorpayPayment(razorpayPaymentId);
    if (
      gatewayPayment.order_id !== paymentRecord.gatewayOrderId ||
      gatewayPayment.amount !== Math.round(paymentRecord.amount * 100) ||
      gatewayPayment.currency !== 'INR' ||
      gatewayPayment.status !== 'captured'
    ) {
      await db.subscriptionPayment.update({ where: { id: paymentRecord.id }, data: { status: 'FAILED', failureReason: 'Payment was not captured for the expected amount.' } });
      return NextResponse.json({ success: false, message: 'Payment was not captured for the expected amount.' }, { status: 400 });
    }

    const subscription = await db.$transaction(async (tx) => {
      const duplicate = await tx.subscriptionPayment.findUnique({ where: { gatewayPaymentId: razorpayPaymentId } });
      if (duplicate && duplicate.id !== paymentRecord.id) throw new Error('This payment has already been processed.');
      await tx.$queryRaw`SELECT "id" FROM "SubscriptionPayment" WHERE "id" = ${paymentRecord.id} FOR UPDATE`;
      const current = await tx.subscriptionPayment.findUnique({ where: { id: paymentRecord.id }, include: { offer: true } });
      if (!current) throw new Error('Subscription payment was not found.');
      if (current.status === 'SUCCESS') return tx.customerSubscription.findUnique({ where: { paymentId: current.id } });
      const latest = await tx.customerSubscription.findFirst({
        where: { customerId: authUser.customerId!, status: 'ACTIVE', expiryDate: { gt: new Date() } },
        orderBy: { expiryDate: 'desc' },
      });
      const startDate = latest ? latest.expiryDate : new Date();
      const expiryDate = calculateSubscriptionExpiry(startDate, current.offer);
      await tx.subscriptionPayment.update({
        where: { id: current.id },
        data: {
          status: 'SUCCESS',
          paymentMethod: 'RAZORPAY',
          gatewayPaymentId: razorpayPaymentId,
          signature: razorpaySignature,
          failureReason: null,
        },
      });
      return tx.customerSubscription.create({
        data: {
          customerId: authUser.customerId!,
          offerId: current.offerId,
          paymentId: current.id,
          startDate,
          expiryDate,
          status: 'ACTIVE',
          pickupsAllowed: current.offer.pickupLimit || 4,
          pickupsUsed: 0,
          autoRenew: false,
        },
        include: { offer: true },
      });
    });
    return NextResponse.json({ success: true, data: subscription });
  } catch (error) {
    console.error('Subscription payment verification failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Subscription payment verification failed.' }, { status: 400 });
  }
}
