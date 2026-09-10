import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import { createRazorpayOrder } from '@/lib/payments/razorpay';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json({ success: false, message: 'Authenticated customer access is required.' }, { status: 401 });
    }

    const { orderId } = await req.json();

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    if (order.customerId !== authUser.customerId) {
      return NextResponse.json({ success: false, message: 'You are not authorized to pay for this order.' }, { status: 403 });
    }

    if (order.financialDirection !== 'CUSTOMER_PAYS') {
      return NextResponse.json({ success: false, message: 'This order does not require a customer payment.' }, { status: 400 });
    }

    if (order.status === 'CANCELLED' || order.status === 'SETTLEMENT_COMPLETED') {
      return NextResponse.json({ success: false, message: 'This order is no longer payable.' }, { status: 400 });
    }

    const amount = Number(order.finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ success: false, message: 'This order has no valid payable amount.' }, { status: 400 });
    }

    const existing = order.payments.find(
      (payment) => payment.direction === 'CUSTOMER_PAYS' && payment.status === 'INITIATED' && payment.gatewayOrderId
    );
    if (existing?.gatewayOrderId) {
      const key = process.env.RAZORPAY_KEY_ID || process.env.PAYMENT_KEY_ID;
      if (!key) throw new Error('Razorpay credentials are not configured on the server.');
      return NextResponse.json({
        success: true,
        data: {
          paymentId: existing.id,
          gatewayOrderId: existing.gatewayOrderId,
          amount: existing.amount,
          currency: 'INR',
          key,
          name: 'Junk It Out Waste Pickup',
          description: `Pickup service charge #${order.orderNumber}`,
        },
      });
    }

    const razorpayOrder = await createRazorpayOrder({
      amountInPaise: Math.round(amount * 100),
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    const payment = await db.payment.create({
      data: {
        orderId,
        amount,
        direction: 'CUSTOMER_PAYS',
        gateway: 'RAZORPAY',
        gatewayOrderId: razorpayOrder.id,
        status: 'INITIATED',
      },
    });

    await db.order.update({ where: { id: order.id }, data: { paymentStatus: 'INITIATED' } });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        gatewayOrderId: razorpayOrder.id,
        amount: payment.amount,
        currency: 'INR',
        key: razorpayOrder.keyId,
        name: 'Junk It Out Waste Pickup',
        description: `Pickup service charge #${order.orderNumber}`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
