import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { fetchRazorpayPayment, verifyRazorpayPaymentSignature } from '@/lib/payments/razorpay';

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
      payment.amount !== Math.round(transaction.amount * 100) ||
      payment.currency !== 'INR' ||
      payment.status !== 'captured'
    ) {
      await db.walletTransaction.update({ where: { id: transaction.id }, data: { status: 'FAILED', failureReason: 'Payment was not captured for the expected amount.' } });
      return NextResponse.json({ success: false, message: 'Payment was not captured for the expected amount.' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      const existingPayment = await tx.walletTransaction.findUnique({ where: { gatewayPaymentId: razorpayPaymentId } });
      if (existingPayment && existingPayment.id !== transaction.id) {
        throw new Error('This payment has already been processed.');
      }
      await tx.$queryRaw`SELECT "id" FROM "CustomerWallet" WHERE "id" = ${transaction.walletId} FOR UPDATE`;
      const wallet = await tx.customerWallet.findUnique({ where: { id: transaction.walletId } });
      if (!wallet) throw new Error('Customer wallet was not found.');
      const updatedWallet = await tx.customerWallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: transaction.amount } },
      });
      const updatedTransaction = await tx.walletTransaction.update({
        where: { id: transaction.id },
        data: {
          status: 'SUCCESS',
          gatewayPaymentId: razorpayPaymentId,
          balanceAfter: updatedWallet.balance,
          failureReason: null,
        },
      });
      return { wallet: updatedWallet, transaction: updatedTransaction };
    });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Wallet top-up verification failed:', error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : 'Wallet top-up verification failed.' }, { status: 400 });
  }
}
