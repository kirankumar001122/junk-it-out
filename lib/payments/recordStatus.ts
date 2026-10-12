export type ProviderPaymentStatus = 'FAILED' | 'AUTHORIZED' | 'CAPTURED';

const TERMINAL_STATUSES = ['CAPTURED', 'REFUNDED'];

const ALLOWED_FROM: Record<ProviderPaymentStatus, string[]> = {
  FAILED: ['PENDING', 'INITIATED', 'FAILED', 'EXPIRED'],
  AUTHORIZED: ['PENDING', 'INITIATED', 'FAILED', 'EXPIRED', 'AUTHORIZED'],
  CAPTURED: ['PENDING', 'INITIATED', 'FAILED', 'EXPIRED', 'AUTHORIZED'],
};

export class PaymentStateError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = 'PaymentStateError';
    this.statusCode = statusCode;
  }
}

type PaymentStateStore = {
  payment: {
    findUnique(args: any): Promise<any>;
    findFirst(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  order: {
    updateMany(args: any): Promise<{ count: number }>;
    findUnique(args: any): Promise<any>;
  };
  $transaction<T>(
    callback: (tx: any) => Promise<T>,
    options?: { isolationLevel: 'Serializable' }
  ): Promise<T>;
};

/**
 * Records a signature/provider-verified state (or a signed webhook state).
 * The serializable transaction makes payment-ID reuse checks and state
 * transitions atomic across verification and webhook requests on PostgreSQL.
 */
export async function recordProviderPaymentStatus(input: {
  store: PaymentStateStore;
  localPaymentId: string;
  providerPaymentId: string;
  signature?: string;
  status: ProviderPaymentStatus;
}) {
  return input.store.$transaction(async (tx) => {
    const current = await tx.payment.findUnique({
      where: { id: input.localPaymentId },
      include: { order: true },
    });
    if (!current) throw new PaymentStateError('Payment attempt not found.', 404);

    const reused = await tx.payment.findFirst({
      where: {
        paymentId: input.providerPaymentId,
        id: { not: current.id },
      },
      select: { id: true },
    });
    if (reused) {
      throw new PaymentStateError('Razorpay payment ID has already been used.', 409);
    }

    if (TERMINAL_STATUSES.includes(current.status)) {
      if (current.paymentId && current.paymentId !== input.providerPaymentId) {
        throw new PaymentStateError('This payment attempt is already finalized.', 409);
      }
      return { paymentId: current.id, orderId: current.orderId, status: current.status, changed: false, shouldDispatch: false };
    }

    if (current.status === input.status && current.paymentId === input.providerPaymentId) {
      return { paymentId: current.id, orderId: current.orderId, status: current.status, changed: false, shouldDispatch: false };
    }

    if (!ALLOWED_FROM[input.status].includes(current.status)) {
      // An older failed event must not regress an authorized attempt.
      return { paymentId: current.id, orderId: current.orderId, status: current.status, changed: false, shouldDispatch: false };
    }

    if (current.order.paymentStatus === 'REFUNDED') {
      throw new PaymentStateError('This order payment has already been refunded.', 409);
    }
    if (
      current.order.paymentStatus === 'CAPTURED' &&
      current.paymentId !== input.providerPaymentId
    ) {
      throw new PaymentStateError('This order already has a captured payment.', 409);
    }

    const paymentUpdate = await tx.payment.updateMany({
      where: {
        id: current.id,
        status: { in: ALLOWED_FROM[input.status] },
      },
      data: {
        paymentId: input.providerPaymentId,
        ...(input.signature ? { signature: input.signature } : {}),
        status: input.status,
      },
    });

    if (paymentUpdate.count !== 1) {
      const latest = await tx.payment.findUnique({ where: { id: current.id } });
      return {
        paymentId: current.id,
        orderId: current.orderId,
        status: latest?.status || current.status,
        changed: false,
        shouldDispatch: false,
      };
    }

    const orderUpdate = await tx.order.updateMany({
      where: {
        id: current.orderId,
        paymentStatus: { notIn: TERMINAL_STATUSES },
      },
      data: {
        paymentStatus: input.status === 'CAPTURED' && current.order.status === 'CANCELLED'
          ? 'REFUND_REQUIRED'
          : input.status,
      },
    });

    if (orderUpdate.count !== 1) {
      const latestOrder = await tx.order.findUnique({
        where: { id: current.orderId },
        select: { paymentStatus: true },
      });
      const expectedOrderStatus = input.status === 'CAPTURED' && current.order.status === 'CANCELLED'
        ? 'REFUND_REQUIRED'
        : input.status;
      if (latestOrder?.paymentStatus !== expectedOrderStatus) {
        // Throwing aborts the transaction and rolls back the payment update.
        throw new PaymentStateError('The order payment state changed; refresh and retry.', 409);
      }
    }

    return {
      paymentId: current.id,
      orderId: current.orderId,
      status: input.status,
      changed: true,
      shouldDispatch: current.order.status !== 'CANCELLED',
    };
  }, { isolationLevel: 'Serializable' });
}
