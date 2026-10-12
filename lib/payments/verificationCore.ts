import { PaymentStateError, recordProviderPaymentStatus, type ProviderPaymentStatus } from './recordStatus';

export class PaymentVerificationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = 'PaymentVerificationError';
    this.statusCode = statusCode;
  }
}

type ProviderPayment = {
  id: string;
  order_id: string;
  amount: number;
  currency: string;
  status: string;
};

export type PaymentVerificationDependencies = {
  store: any;
  verifySignature: (orderId: string, paymentId: string, signature: string) => boolean;
  fetchPayment: (paymentId: string) => Promise<ProviderPayment>;
  dispatchPaidOrder: (orderId: string) => Promise<void>;
};

export async function verifyAndRecordPaymentCore(
  input: {
    orderId?: string;
    razorpayOrderId: string;
    razorpayPaymentId: string;
    razorpaySignature: string;
    customerId?: string | null;
  },
  dependencies: PaymentVerificationDependencies
) {
  const payment = await dependencies.store.payment.findFirst({
    where: {
      ...(input.orderId ? { orderId: input.orderId } : {}),
      gatewayOrderId: input.razorpayOrderId,
      gateway: 'RAZORPAY',
      direction: 'CUSTOMER_PAYS',
    },
    include: { order: true },
  });

  if (!payment) throw new PaymentVerificationError('Payment attempt not found.', 404);
  if (input.customerId && payment.order.customerId !== input.customerId) {
    throw new PaymentVerificationError('You are not authorized to verify this payment.', 403);
  }

  if (!dependencies.verifySignature(input.razorpayOrderId, input.razorpayPaymentId, input.razorpaySignature)) {
    throw new PaymentVerificationError('Invalid Razorpay payment signature.', 400);
  }

  // A duplicate callback may return an already established terminal result.
  // It must still carry a valid Razorpay payment signature and the same ID.
  if (
    ['CAPTURED', 'REFUNDED'].includes(payment.status) &&
    payment.paymentId === input.razorpayPaymentId
  ) {
    return { id: payment.id, orderId: payment.orderId, status: payment.status };
  }

  let providerPayment: ProviderPayment;
  try {
    providerPayment = await dependencies.fetchPayment(input.razorpayPaymentId);
  } catch {
    throw new PaymentVerificationError('Unable to verify payment with Razorpay.', 502);
  }

  if (
    providerPayment.id !== input.razorpayPaymentId ||
    providerPayment.order_id !== input.razorpayOrderId ||
    providerPayment.currency !== 'INR' ||
    providerPayment.amount !== Math.round(Number(payment.amount) * 100)
  ) {
    throw new PaymentVerificationError('Razorpay payment does not match the expected order.', 400);
  }

  let status: ProviderPaymentStatus;
  if (providerPayment.status === 'captured') status = 'CAPTURED';
  else if (providerPayment.status === 'authorized') status = 'AUTHORIZED';
  else throw new PaymentVerificationError('Razorpay payment is not authorized or captured.', 400);

  let result: Awaited<ReturnType<typeof recordProviderPaymentStatus>>;
  try {
    result = await recordProviderPaymentStatus({
      store: dependencies.store,
      localPaymentId: payment.id,
      providerPaymentId: input.razorpayPaymentId,
      signature: input.razorpaySignature,
      status,
    });
  } catch (error) {
    if (error instanceof PaymentStateError) {
      throw new PaymentVerificationError(error.message, error.statusCode);
    }
    throw error;
  }

  if (result.status === 'CAPTURED' && result.changed && result.shouldDispatch !== false) {
    await dependencies.dispatchPaidOrder(result.orderId);
  }

  return { id: result.paymentId, orderId: result.orderId, status: result.status };
}
