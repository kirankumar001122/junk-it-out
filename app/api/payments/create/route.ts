import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';
import {
  getSafeErrorDependency,
  getSafeErrorType,
  getSafeDatabaseCode,
  getSafePrismaCode,
  logStructured,
  withApiRequestLogging,
  type ApiRequestContext,
} from '@/lib/observability/structuredLogger';
import {
  createRazorpayOrder,
  RazorpayOrderCreationError,
} from '@/lib/payments/razorpay';

const ACTIVE_PAYMENT_STATUSES = [
  'CREATION_PENDING',
  'INITIATED',
  'AUTHORIZED',
] as const;

async function handlePost(req: NextRequest, context: ApiRequestContext) {
  try {
    const authUser = await getAuthUser(req);

    if (!authUser || authUser.role !== 'CUSTOMER' || !authUser.customerId) {
      return NextResponse.json(
        {
          success: false,
          message: 'Authenticated customer access is required.',
        },
        { status: 401 },
      );
    }

    const { orderId } = await req.json();
    if (!orderId) {
      return NextResponse.json(
        { success: false, message: 'Order ID is required.' },
        { status: 400 },
      );
    }

    const order = await db.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, message: 'Order not found' },
        { status: 404 },
      );
    }

    if (order.customerId !== authUser.customerId) {
      return NextResponse.json(
        {
          success: false,
          message: 'You are not authorized to pay for this order.',
        },
        { status: 403 },
      );
    }

    if (order.financialDirection !== 'CUSTOMER_PAYS') {
      return NextResponse.json(
        {
          success: false,
          message: 'This order does not require a customer payment.',
        },
        { status: 400 },
      );
    }

    if (
      order.status === 'CANCELLED' ||
      order.status === 'SETTLEMENT_COMPLETED' ||
      order.paymentStatus === 'REFUNDED' ||
      order.paymentStatus === 'PARTIALLY_REFUNDED' ||
      (order.paymentStatus && order.paymentStatus.startsWith('REFUND_'))
    ) {
      return NextResponse.json(
        { success: false, message: 'This order is no longer payable.' },
        { status: 400 },
      );
    }

    // 1. Order already paid check
    if (order.paymentStatus === 'CAPTURED' || order.paymentStatus === 'SUCCESS') {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        message: 'This order has already been paid and verified.',
        data: {
          orderId: order.id,
          status: 'CAPTURED',
          paymentStatus: 'CAPTURED',
        },
      });
    }

    const amount = Number(order.finalAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: 'This order has no valid payable amount.' },
        { status: 400 },
      );
    }

    const attempt = await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id" = ${order.id} FOR UPDATE`;

      const currentOrder = await tx.order.findUnique({
        where: { id: order.id },
      });

      if (!currentOrder) {
        return { kind: 'rejected' as const, status: 404, message: 'Order not found' };
      }

      if (currentOrder.customerId !== authUser.customerId) {
        return {
          kind: 'rejected' as const,
          status: 403,
          message: 'You are not authorized to pay for this order.',
        };
      }

      if (currentOrder.financialDirection !== 'CUSTOMER_PAYS') {
        return {
          kind: 'rejected' as const,
          status: 400,
          message: 'This order does not require a customer payment.',
        };
      }

      if (
        currentOrder.status === 'CANCELLED' ||
        currentOrder.status === 'SETTLEMENT_COMPLETED' ||
        currentOrder.paymentStatus === 'REFUNDED' ||
        currentOrder.paymentStatus === 'PARTIALLY_REFUNDED' ||
        (currentOrder.paymentStatus && currentOrder.paymentStatus.startsWith('REFUND_'))
      ) {
        return {
          kind: 'rejected' as const,
          status: 400,
          message: 'This order is no longer payable.',
        };
      }

      if (currentOrder.paymentStatus === 'CAPTURED' || currentOrder.paymentStatus === 'SUCCESS') {
        return { kind: 'alreadyPaid' as const, orderId: currentOrder.id };
      }

      const currentAmount = Number(currentOrder.finalAmount);
      if (!Number.isFinite(currentAmount) || currentAmount <= 0) {
        return {
          kind: 'rejected' as const,
          status: 400,
          message: 'This order has no valid payable amount.',
        };
      }

      const activePayment = await tx.payment.findFirst({
        where: {
          orderId: currentOrder.id,
          direction: 'CUSTOMER_PAYS',
          status: { in: [...ACTIVE_PAYMENT_STATUSES] },
        },
        orderBy: { createdAt: 'desc' },
      });

      if (activePayment) {
        return { kind: 'existing' as const, payment: activePayment, order: currentOrder };
      }

      const payment = await tx.payment.create({
        data: {
          orderId: currentOrder.id,
          amount: currentAmount,
          direction: 'CUSTOMER_PAYS',
          gateway: 'RAZORPAY',
          status: 'CREATION_PENDING',
        },
      });

      await tx.order.update({
        where: { id: currentOrder.id },
        data: { paymentStatus: 'INITIATED' },
      });

      return { kind: 'new' as const, payment, order: currentOrder, amount: currentAmount };
    });

    if (attempt.kind === 'rejected') {
      return NextResponse.json(
        { success: false, message: attempt.message },
        { status: attempt.status },
      );
    }

    if (attempt.kind === 'alreadyPaid') {
      return NextResponse.json({
        success: true,
        alreadyPaid: true,
        message: 'This order has already been paid and verified.',
        data: {
          orderId: attempt.orderId,
          status: 'CAPTURED',
          paymentStatus: 'CAPTURED',
        },
      });
    }

    if (attempt.kind === 'existing') {
      if (attempt.payment.status === 'CREATION_PENDING') {
        return NextResponse.json(
          {
            success: false,
            message: 'A payment attempt is already being prepared. Please retry shortly.',
          },
          { status: 409 },
        );
      }

      if (!attempt.payment.gatewayOrderId) {
        return NextResponse.json(
          { success: false, message: 'The payment attempt requires reconciliation.' },
          { status: 409 },
        );
      }

      const key = process.env.RAZORPAY_KEY_ID || process.env.PAYMENT_KEY_ID;
      if (!key) {
        throw new Error('Razorpay credentials are not configured on the server.');
      }

      return NextResponse.json({
        success: true,
        data: {
          paymentId: attempt.payment.id,
          gatewayOrderId: attempt.payment.gatewayOrderId,
          amount: attempt.payment.amount,
          currency: 'INR',
          key,
          name: 'Junk It Out Waste Pickup',
          description: `Pickup service charge #${attempt.order.orderNumber}`,
        },
      });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amountInPaise: Math.round(attempt.amount * 100),
        receipt: attempt.order.orderNumber,
        notes: { orderId: attempt.order.id, orderNumber: attempt.order.orderNumber },
      });
    } catch (error) {
      if (!(error instanceof RazorpayOrderCreationError) || !error.uncertain) {
        await db.payment.update({
          where: { id: attempt.payment.id },
          data: { status: 'FAILED' },
        });
      }
      throw error;
    }

    const payment = await db.payment.update({
      where: { id: attempt.payment.id },
      data: {
        gatewayOrderId: razorpayOrder.id,
        status: 'INITIATED',
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        paymentId: payment.id,
        gatewayOrderId: payment.gatewayOrderId,
        amount: payment.amount,
        currency: 'INR',
        key: razorpayOrder.keyId,
        name: 'Junk It Out Waste Pickup',
        description: `Pickup service charge #${attempt.order.orderNumber}`,
      },
    });
  } catch (error: any) {
    logStructured('error', 'payment.create.failed', {
      ...context,
      dependency: getSafeErrorDependency(error),
      errorType: getSafeErrorType(error),
      prismaCode: getSafePrismaCode(error),
      databaseCode: getSafeDatabaseCode(error),
    });

    const isRazorpayAuthError =
      error instanceof RazorpayOrderCreationError &&
      (error.message === 'Razorpay authentication failed.' ||
        (error as any).statusCode === 401 ||
        (error as any).statusCode === 403 ||
        /authentication failed|invalid .*key|invalid .*credential/i.test(error.message));

    const isUncertain =
      error instanceof RazorpayOrderCreationError && error.uncertain;

    return NextResponse.json(
      {
        success: false,
        message: isUncertain
          ? 'Payment provider response is uncertain. Please contact support before retrying.'
          : isRazorpayAuthError
            ? 'Unable to authenticate with the payment provider.'
            : 'Unable to create Razorpay payment.',
      },
      { status: isUncertain || isRazorpayAuthError ? 502 : 500 },
    );
  }
}

export const POST = withApiRequestLogging('/api/payments/create', handlePost);
