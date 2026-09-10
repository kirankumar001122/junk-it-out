import { db } from '@/lib/db';
import { fetchRazorpayPayment, verifyRazorpayPaymentSignature } from './razorpay';

export class PaymentVerificationError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

export async function verifyAndRecordPayment(input: {
  orderId?: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  customerId?: string | null;
}) {
  const payment = await db.payment.findFirst({
    where: {
      ...(input.orderId ? { orderId: input.orderId } : {}),
      gatewayOrderId: input.razorpayOrderId,
      direction: 'CUSTOMER_PAYS',
    },
    include: { order: true },
  });
  if (!payment) throw new PaymentVerificationError('Payment attempt not found.', 404);
  if (input.customerId && payment.order.customerId !== input.customerId) {
    throw new PaymentVerificationError('You are not authorized to verify this payment.', 403);
  }

  const reusedPayment = await db.payment.findFirst({
    where: { paymentId: input.razorpayPaymentId, id: { not: payment.id } },
  });
  if (reusedPayment) throw new PaymentVerificationError('Razorpay payment ID has already been used.', 409);

  if (payment.status === 'CAPTURED' && payment.paymentId === input.razorpayPaymentId) {
    return { id: payment.id, orderId: payment.orderId, status: payment.status };
  }

  if (!verifyRazorpayPaymentSignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new PaymentVerificationError('Invalid Razorpay payment signature.', 400);
  }

  const providerPayment = await fetchRazorpayPayment(input.razorpayPaymentId);
  if (
    providerPayment.id !== input.razorpayPaymentId ||
    providerPayment.order_id !== input.razorpayOrderId ||
    providerPayment.currency !== 'INR' ||
    providerPayment.amount !== Math.round(payment.amount * 100)
  ) {
    throw new PaymentVerificationError('Razorpay payment does not match the expected order amount.', 400);
  }

  const localStatus = providerPayment.status === 'captured'
    ? 'CAPTURED'
    : providerPayment.status === 'authorized'
    ? 'AUTHORIZED'
    : null;
  if (!localStatus) {
    throw new PaymentVerificationError(`Razorpay payment is not authorized or captured (${providerPayment.status}).`, 400);
  }

  return db.$transaction(async (tx) => {
    const updated = await tx.payment.update({
      where: { id: payment.id },
      data: {
        paymentId: input.razorpayPaymentId,
        signature: input.razorpaySignature,
        status: localStatus,
      },
    });
    await tx.order.update({ where: { id: payment.orderId }, data: { paymentStatus: localStatus } });
    return { id: updated.id, orderId: payment.orderId, status: updated.status };
  });
}