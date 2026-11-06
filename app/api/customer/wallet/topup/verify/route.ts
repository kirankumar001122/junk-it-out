import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { fetchRazorpayPayment, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';
import { fromPaise, toPaise } from '@/lib/wallet';
import { dispatchCustomerWalletNotification } from '@/lib/services/walletNotification';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const transactionId = typeof body.transactionId === 'string' ? body.transactionId : '';
    const razorpayOrderId = typeof body.razorpay_order_id === 'string' ? body.razorpay_order_id : '';
    const razorpayPaymentId = typeof body.razorpay_payment_id === 'string' ? body.razorpay_payment_id : '';
    const razorpaySignature = typeof body.razorpay_signature === 'string' ? body.razorpay_signature : '';
    const transaction = await db.walletTransaction.findFirst({
      where: { id: transactionId, customerId: authUser.customerId, type: 'TOPUP' },
    });
    if (!transaction || !transaction.gatewayOrderId || transaction.gatewayOrderId !== razorpayOrderId) {
      return NextResponse.json({ success: false, message: 'Wallet top-up transaction was not found.' }, { status: 404 });
    }
    if (transaction.status === 'SUCCESS') {
      return NextResponse.json({ success: true, alreadyProcessed: true, data: transaction });
    }
    if (!verifyRazorpayPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      await db.walletTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failureReason: 'Invalid payment signature.' } });
      return NextResponse.json({ success: false, message: 'Payment signature verification failed.' }, { status: 400 });
    }

    const payment = await fetchRazorpayPayment(razorpayPaymentId);
    if (
      payment.order_id !== transaction.gatewayOrderId ||
      payment.amount !== (transaction.amountPaise || toPaise(transaction.amount)) ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      await db.walletTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failureReason: 'Payment was not captured for the expected amount.' } });
      return NextResponse.json({ success: false, message: 'Payment was not captured for the expected amount.' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "WalletTransaction" WHERE "id" = ${transaction.id} FOR UPDATE`;
      const currentTransaction = await tx.walletTransaction.findUnique({ where: { id: transaction.id } });
      if (!currentTransaction || currentTransaction.customerId !== authUser.customerId) {
        throw new Error('Wallet top-up transaction was not found.');
      }
      if (currentTransaction.status === 'SUCCESS') {
        return { transaction: currentTransaction, alreadyProcessed: true };
      }
      const existingPayment = await tx.walletTransaction.findUnique({ where: { gatewayPaymentId: razorpayPaymentId } });
      if (existingPayment && existingPayment.id !== transaction.id) {
        throw new Error('This payment has already been processed.');
      }
      await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${currentTransaction.walletId} FOR UPDATE`;
      const wallet = await tx.customerWallet.findUnique({ where: { id: currentTransaction.walletId } });
      if (!wallet) throw new Error('Customer wallet was not found.');
      const currentBalancePaise = typeof wallet.balancePaise === 'number' ? wallet.balancePaise : toPaise(wallet.balance);
      const currentPaidBalancePaise = typeof wallet.paidBalancePaise === 'number' ? wallet.paidBalancePaise : currentBalancePaise;
      const rechargePaise = currentTransaction.amountPaise || toPaise(currentTransaction.amount);
      const bonusPaise = currentTransaction.bonusAmount ? toPaise(currentTransaction.bonusAmount) : 0;
      const nextBalancePaise = currentBalancePaise + rechargePaise + bonusPaise;
      const updatedWallet = await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { balance: fromPaise(nextBalancePaise), balancePaise: nextBalancePaise, paidBalancePaise: currentPaidBalancePaise + rechargePaise },
      });
      const updatedTransaction = await tx.walletTransaction.update({
        where: { id: currentTransaction.id },
        data: {
          status: 'SUCCESS',
          gatewayPaymentId: razorpayPaymentId,
          amountPaise: rechargePaise,
          balanceAfter: updatedWallet.balance,
          balanceAfterPaise: nextBalancePaise,
          failureReason: null,
        },
      });
      let bonusTransaction = null;
      if ((currentTransaction.bonusAmount || 0) > 0) {
        bonusTransaction = await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            customerId: currentTransaction.customerId,
            type: 'BONUS',
            amount: currentTransaction.bonusAmount || 0,
            amountPaise: bonusPaise,
            originalRechargeAmount: currentTransaction.amount,
            bonusAmount: currentTransaction.bonusAmount,
            bonusExpiryDate: currentTransaction.bonusExpiryDate,
            campaignId: currentTransaction.campaignId,
            status: 'SUCCESS',
            referenceId: `wallet-bonus-${currentTransaction.id}`,
            balanceAfter: updatedWallet.balance,
            balanceAfterPaise: nextBalancePaise,
          },
        });
        await tx.walletBonusGrant.create({
          data: {
            walletId: wallet.id,
            customerId: currentTransaction.customerId,
            sourceTransactionId: bonusTransaction.id,
            rechargeTransactionId: currentTransaction.id,
            campaignId: currentTransaction.campaignId,
            grantedPaise: bonusPaise,
            remainingPaise: bonusPaise,
            status: 'ACTIVE',
            expiresAt: currentTransaction.bonusExpiryDate,
          },
        });
      }

      await dispatchCustomerWalletNotification(tx, {
        customerId: currentTransaction.customerId,
        type: 'TOPUP',
        amount: currentTransaction.amount,
        balanceAfter: updatedWallet.balance,
        referenceId: updatedTransaction.referenceId,
      });

      return { wallet: updatedWallet, transaction: updatedTransaction, bonusTransaction, alreadyProcessed: false };
    });
    return NextResponse.json({ success: true, alreadyProcessed: result.alreadyProcessed, data: result });
  } catch (error) {
    console.error('Wallet top-up verification failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Wallet top-up verification failed.' }, { status: 400 });
  }
}
