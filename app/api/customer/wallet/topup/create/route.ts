import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { createRazorpayOrder, RazorpayOrderCreationError } from '@/lib/payments/razorpay';
import { calculateWalletBonusQuote } from '@/lib/walletBonus';
import { toPaise } from '@/lib/wallet';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || amount < 10 || amount > 100000 || Math.round(amount * 100) !== amount * 100) {
      return NextResponse.json({ success: false, message: 'Top-up amount must be between ₹10 and ₹100,000.' }, { status: 400 });
    }
    const idempotencyKey = typeof body.idempotencyKey === 'string'
      ? body.idempotencyKey.trim()
      : req.headers.get('Idempotency-Key')?.trim();
    if (!idempotencyKey || idempotencyKey.length > 128) {
      return NextResponse.json({ success: false, message: 'A valid idempotency key is required.' }, { status: 400 });
    }
    const existing = await db.walletTransaction.findUnique({ where: { idempotencyKey } });
    if (existing && existing.customerId === authUser.customerId) {
      return NextResponse.json({ success: true, alreadyCreated: true, data: { transactionId: existing.id, gatewayOrderId: existing.gatewayOrderId, amount: Math.round(existing.amount * 100), currency: 'INR' } });
    }
    if (existing) return NextResponse.json({ success: false, message: 'Idempotency key has already been used.' }, { status: 409 });
    const quote = await calculateWalletBonusQuote(amount);

    const wallet = await db.customerWallet.upsert({
      where: { customerId: authUser.customerId },
      update: {},
      create: { customerId: authUser.customerId },
    });
    const transaction = await db.walletTransaction.create({
      data: {
        walletId: wallet.id,
        customerId: authUser.customerId,
        type: 'TOPUP',
        amount,
        amountPaise: toPaise(amount),
        originalRechargeAmount: amount,
        bonusAmount: quote.bonusAmount,
        campaignId: quote.campaignId,
        bonusExpiryDate: quote.bonusAmount > 0 && quote.bonusExpiryDays > 0
          ? new Date(Date.now() + quote.bonusExpiryDays * 86400000)
          : null,
        status: 'PENDING',
        referenceId: `wallet-topup-${Date.now()}`,
        idempotencyKey,
      },
    });

    try {
      const razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(amount * 100),
        receipt: `wallet-${transaction.id}`,
        notes: { purpose: 'wallet_topup', customerId: authUser.customerId, transactionId: transaction.id },
      });
      const updated = await db.walletTransaction.update({
        where: { id: transaction.id },
        data: { gatewayOrderId: razorpayOrder.id },
      });
      return NextResponse.json({
        success: true,
        data: {
          transactionId: updated.id,
          gatewayOrderId: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: razorpayOrder.keyId,
        },
      });
    } catch (error) {
      await db.walletTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED', failureReason: 'Unable to create payment order.' },
      });
      if (error instanceof RazorpayOrderCreationError) {
        return NextResponse.json({ success: false, message: error.message }, { status: error.statusCode });
      }
      throw error;
    }
  } catch (error) {
    console.error('Wallet top-up creation failed:', error);
    return NextResponse.json({ success: false, message: 'Unable to start wallet top-up.' }, { status: 500 });
  }
}
