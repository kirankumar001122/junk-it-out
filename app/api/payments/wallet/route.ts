import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { db } from '@/lib/db';
import { spendWalletPaise, toPaise } from '@/lib/wallet';
import { dispatchCustomerWalletNotification } from '@/lib/services/walletNotification';
import { roundCurrency } from '@/lib/wallet';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const authUser = await getAuthUser(req);
  if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
    return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const orderId = typeof body.orderId === 'string' ? body.orderId : '';
    if (!orderId) {
      return NextResponse.json({ success: false, message: 'Order ID is required.' }, { status: 400 });
    }

    const result = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
      const order = await tx.order.findUnique({
        where: { id: orderId },
        include: { payments: { where: { direction: 'CUSTOMER_PAYS' }, orderBy: { createdAt: 'desc' } } },
      });
      if (!order || order.customerId !== authUser.customerId) {
        return { status: 404, body: { success: false, message: 'Order not found.' } };
      }
      if (
        order.financialDirection !== 'CUSTOMER_PAYS' ||
        order.status === 'CANCELLED' ||
        order.status === 'SETTLEMENT_COMPLETED' ||
        order.paymentStatus === 'REFUNDED' ||
        order.paymentStatus === 'PARTIALLY_REFUNDED' ||
        order.paymentStatus?.startsWith('REFUND_')
      ) {
        return { status: 400, body: { success: false, message: 'This order cannot be paid from the wallet.' } };
      }
      if (order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS') {
        return { status: 200, body: { success: true, alreadyPaid: true, data: { orderId: order.id, paymentStatus: order.paymentStatus } } };
      }

      const amount = Number(order.finalAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return { status: 400, body: { success: false, message: 'This order has no valid payable amount.' } };
      }
      const payableAmount = roundCurrency(amount);
      const existingWalletPayment = order.payments.find(
        (payment) => payment.gateway === 'WALLET' && payment.status === 'SUCCESS' && payment.paymentId === `wallet:${order.id}`,
      );
      if (existingWalletPayment) {
        return { status: 200, body: { success: true, alreadyPaid: true, data: { orderId: order.id, paymentStatus: 'CAPTURED' } } };
      }

      const payment = order.payments[0] ?? await tx.payment.create({
        data: { orderId: order.id, amount: payableAmount, direction: 'CUSTOMER_PAYS', gateway: 'WALLET', status: 'PENDING' },
      });
      if (payment.amount !== payableAmount) {
        return { status: 409, body: { success: false, message: 'Order payment amount changed. Please restart checkout.' } };
      }
      const debit = await spendWalletPaise(tx, {
        customerId: authUser.customerId!,
        amountPaise: toPaise(payableAmount),
        referenceId: `order:${order.id}`,
        reason: `Wallet payment for order #${order.orderNumber}`,
      });
      if (debit.alreadyProcessed) {
        return { status: 200, body: { success: true, alreadyPaid: true, data: { orderId: order.id, paymentStatus: 'CAPTURED' } } };
      }
      await tx.payment.update({
        where: { id: payment.id },
        data: { gateway: 'WALLET', status: 'SUCCESS', paymentId: `wallet:${order.id}` },
      });
      const updatedOrder = await tx.order.update({
        where: { id: order.id },
        data: { paymentStatus: 'CAPTURED' },
      });

      if (debit.transaction) {
        await dispatchCustomerWalletNotification(tx, {
          customerId: authUser.customerId!,
          type: 'WALLET_DEBIT',
          amount: payableAmount,
          balanceAfter: debit.transaction.balanceAfter,
          reason: `Payment for order #${order.orderNumber}`,
          referenceId: `order:${order.id}`,
        });
      }

      return { status: 200, body: { success: true, data: updatedOrder } };
    });

    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    console.error('Wallet order payment failed:', error);
    return NextResponse.json({ success: false, message: 'Wallet payment could not be completed.' }, { status: 500 });
  }
}
