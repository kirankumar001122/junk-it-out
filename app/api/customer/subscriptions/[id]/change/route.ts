import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { calculateSubscriptionExpiry } from '@/lib/subscriptions';
import { roundCurrency } from '@/lib/wallet';
import { createRazorpayOrder } from '@/lib/payments/razorpay';
import {
  dispatchCustomerWalletNotification,
  dispatchSubscriptionNotification,
} from '@/lib/services/walletNotification';

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
    const targetOfferId = typeof body.targetOfferId === 'string' ? body.targetOfferId.trim() : '';
    const paymentMethod = body.paymentMethod === 'WALLET' ? 'WALLET' : 'RAZORPAY';

    if (!targetOfferId) {
      return NextResponse.json(
        { success: false, message: 'Target subscription plan ID is required.' },
        { status: 400 },
      );
    }

    const currentSub = await db.customerSubscription.findUnique({
      where: { id },
      include: { offer: true },
    });

    if (!currentSub || currentSub.customerId !== authUser.customerId) {
      return NextResponse.json(
        { success: false, message: 'Current subscription not found.' },
        { status: 404 },
      );
    }

    if (currentSub.offerId === targetOfferId) {
      return NextResponse.json(
        { success: false, message: 'You are already subscribed to this plan. Use renewal to extend it.' },
        { status: 400 },
      );
    }

    const targetOffer = await db.subscriptionOffer.findFirst({
      where: { id: targetOfferId, active: true },
    });

    if (!targetOffer) {
      return NextResponse.json(
        { success: false, message: 'Target subscription plan not found or is currently inactive.' },
        { status: 404 },
      );
    }

    const price = roundCurrency(targetOffer.price);
    if (!Number.isFinite(price) || price <= 0) {
      return NextResponse.json(
        { success: false, message: 'Invalid target plan pricing.' },
        { status: 400 },
      );
    }

    if (paymentMethod === 'WALLET') {
      const result = await db.$transaction(async (tx) => {
        const wallet = await tx.customerWallet.upsert({
          where: { customerId: authUser.customerId! },
          update: {},
          create: { customerId: authUser.customerId! },
        });

        await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${wallet.id} FOR UPDATE`;
        const lockedWallet = await tx.customerWallet.findUnique({
          where: { id: wallet.id },
        });

        if (!lockedWallet || lockedWallet.balance < price) {
          throw new Error('Insufficient wallet balance to change subscription plan.');
        }

        // Effective date rule: seamlessly start after current subscription expiry to preserve entitlements
        const now = new Date();
        const isCurrentActive = currentSub.status === 'ACTIVE' && currentSub.expiryDate > now;
        const startDate = isCurrentActive ? currentSub.expiryDate : now;
        const expiryDate = calculateSubscriptionExpiry(startDate, targetOffer);

        const payment = await tx.subscriptionPayment.create({
          data: {
            customerId: authUser.customerId!,
            offerId: targetOffer.id,
            amount: price,
            paymentMethod: 'WALLET',
            status: 'SUCCESS',
          },
        });

        const newSubscription = await tx.customerSubscription.create({
          data: {
            customerId: authUser.customerId!,
            offerId: targetOffer.id,
            paymentId: payment.id,
            startDate,
            expiryDate,
            status: 'ACTIVE',
            pickupsAllowed: targetOffer.pickupLimit || 4,
            pickupsUsed: 0,
            autoRenew: false,
          },
          include: { offer: true },
        });

        const nextBalance = roundCurrency(lockedWallet.balance - price);
        const updatedWallet = await tx.customerWallet.update({
          where: { id: lockedWallet.id },
          data: { balance: nextBalance },
        });

        const walletTx = await tx.walletTransaction.create({
          data: {
            walletId: updatedWallet.id,
            customerId: authUser.customerId!,
            type: 'WALLET_DEBIT',
            amount: price,
            balanceAfter: nextBalance,
            status: 'SUCCESS',
            referenceId: `sub-change:${newSubscription.id}`,
            reason: `Plan change: ${currentSub.offer.name} -> ${targetOffer.name}`,
          },
        });

        await tx.subscriptionPayment.update({
          where: { id: payment.id },
          data: { walletTransactionId: walletTx.id },
        });

        // Notifications
        await dispatchSubscriptionNotification(tx, {
          customerId: authUser.customerId!,
          type: 'SUBSCRIPTION_CHANGE',
          planName: targetOffer.name,
          price,
          expiryDate,
          pickupsAllowed: targetOffer.pickupLimit || 4,
          reason: `Switched from ${currentSub.offer.name}`,
        });

        await dispatchCustomerWalletNotification(tx, {
          customerId: authUser.customerId!,
          type: 'WALLET_DEBIT',
          amount: price,
          balanceAfter: nextBalance,
          reason: `Plan change: ${currentSub.offer.name} -> ${targetOffer.name}`,
          referenceId: `sub-change:${newSubscription.id}`,
        });

        return { subscription: newSubscription, wallet: updatedWallet };
      });

      return NextResponse.json({
        success: true,
        message: `Plan changed successfully to ${targetOffer.name}.`,
        data: result.subscription,
      });
    }

    // Razorpay flow for plan change
    const payment = await db.subscriptionPayment.create({
      data: {
        customerId: authUser.customerId,
        offerId: targetOffer.id,
        amount: price,
        paymentMethod: 'RAZORPAY',
        status: 'PENDING',
      },
    });

    try {
      const razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(price * 100),
        receipt: `sub-chg-${payment.id}`,
        notes: {
          purpose: 'subscription_plan_change',
          customerId: authUser.customerId,
          currentSubscriptionId: currentSub.id,
          targetOfferId: targetOffer.id,
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
        data: {
          status: 'FAILED',
          failureReason: error instanceof Error ? error.message : 'Gateway order creation failed.',
        },
      });
      throw error;
    }
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : 'Plan change failed.' },
      { status: 400 },
    );
  }
}
