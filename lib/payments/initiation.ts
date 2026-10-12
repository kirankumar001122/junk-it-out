const INITIATION_LEASE_MS = 60_000;
const RETRYABLE_PAYMENT_STATUSES = ['INITIATED', 'FAILED', 'EXPIRED', 'PENDING'];

type InitiationStore = {
  order: {
    findUnique(args: any): Promise<any>;
    updateMany(args: any): Promise<{ count: number }>;
  };
  payment: {
    updateMany(args: any): Promise<{ count: number }>;
    create(args: any): Promise<any>;
  };
  $transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
};

type PaymentInitiationDependencies = {
  store: InitiationStore;
  createGatewayOrder: (input: {
    amountInPaise: number;
    receipt: string;
    notes?: Record<string, string>;
  }) => Promise<{ id: string; amount: number; currency: string; keyId: string }>;
  getKeyId: () => string;
  now?: () => number;
};

export class PaymentInitiationError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'PaymentInitiationError';
    this.statusCode = statusCode;
  }
}

function checkoutData(payment: any, order: any, key: string) {
  return {
    paymentId: payment.id,
    gatewayOrderId: payment.gatewayOrderId,
    amount: payment.amount,
    currency: 'INR',
    key,
    name: 'Junk It Out Waste Pickup',
    description: `Pickup service charge #${order.orderNumber}`,
  };
}

function ensureOrderEligible(order: any, customerId: string) {
  if (order.customerId !== customerId) {
    throw new PaymentInitiationError('You are not authorized to pay for this order.', 403);
  }
  if (order.financialDirection !== 'CUSTOMER_PAYS') {
    throw new PaymentInitiationError('This order does not require a customer payment.', 400);
  }
  if (['CANCELLED', 'SETTLEMENT_COMPLETED'].includes(order.status)) {
    throw new PaymentInitiationError('This order is no longer payable.', 400);
  }
  if (
    order.paymentStatus === 'REFUNDED' ||
    order.payments.some((payment: any) => payment.status === 'REFUNDED')
  ) {
    throw new PaymentInitiationError('This order payment has already been refunded.', 409);
  }
}

export async function initiateCustomerPayment(
  orderId: string,
  customerId: string,
  dependencies: PaymentInitiationDependencies
) {
  const { store } = dependencies;
  const now = dependencies.now || Date.now;
  let order = await store.order.findUnique({
    where: { id: orderId },
    include: { payments: { orderBy: { createdAt: 'desc' } } },
  });

  if (!order) throw new PaymentInitiationError('Order not found.', 404);
  ensureOrderEligible(order, customerId);

  const payments = order.payments.filter((payment: any) => payment.direction === 'CUSTOMER_PAYS');
  if (order.paymentStatus === 'CAPTURED' || order.payments.some((payment: any) => payment.status === 'CAPTURED')) {
    throw new PaymentInitiationError('This order already has a captured payment.', 409);
  }
  if (payments.some((payment: any) => payment.status === 'AUTHORIZED')) {
    throw new PaymentInitiationError('A payment is authorized and still processing.', 409);
  }

  const amount = Number(order.finalAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new PaymentInitiationError('This order has no valid payable amount.', 400);
  }

  let reusable = payments.find((payment: any) =>
    RETRYABLE_PAYMENT_STATUSES.includes(payment.status) && payment.gatewayOrderId
  );
  if (reusable) {
    const storedGatewayOrderIds = new Set(
      payments
        .filter((payment: any) => payment.gatewayOrderId)
        .map((payment: any) => payment.gatewayOrderId)
    );
    if (storedGatewayOrderIds.size > 1) {
      throw new PaymentInitiationError('Multiple payment orders already exist for this pickup. Contact support before retrying.', 409);
    }

    if (Number(reusable.amount) !== amount) {
      throw new PaymentInitiationError('The existing payment amount no longer matches this order. Contact support before retrying.', 409);
    }

    if (reusable.status !== 'INITIATED') {
      await store.$transaction(async (tx) => {
        await tx.payment.updateMany({
          where: { id: reusable.id, status: { in: ['FAILED', 'EXPIRED', 'PENDING'] } },
          data: { status: 'INITIATED' },
        });
        await tx.order.updateMany({
          where: { id: order.id, paymentStatus: { in: ['PENDING', 'FAILED', 'EXPIRED', 'INITIATING'] }, status: { notIn: ['CANCELLED', 'SETTLEMENT_COMPLETED'] } },
          data: { paymentStatus: 'INITIATED' },
        });
      });

      const refreshedOrder = await store.order.findUnique({
        where: { id: orderId },
        include: { payments: { orderBy: { createdAt: 'desc' } } },
      });
      if (!refreshedOrder) throw new PaymentInitiationError('Order not found.', 404);
      ensureOrderEligible(refreshedOrder, customerId);
      const refreshedPayment = refreshedOrder.payments.find((payment: any) => payment.id === reusable.id);
      if (
        refreshedOrder.paymentStatus === 'CAPTURED' ||
        refreshedPayment?.status === 'CAPTURED'
      ) {
        throw new PaymentInitiationError('This order already has a captured payment.', 409);
      }
      if (refreshedPayment?.status !== 'INITIATED') {
        throw new PaymentInitiationError('Payment state changed while retrying. Refresh the order before continuing.', 409);
      }
      order = refreshedOrder;
      reusable = refreshedPayment;
    }

    return checkoutData(reusable, order, dependencies.getKeyId());
  }

  if (order.paymentStatus === 'AUTHORIZED' || order.paymentStatus === 'INITIATED') {
    throw new PaymentInitiationError('A payment attempt is already processing. Refresh the order before retrying.', 409);
  }

  if (order.paymentStatus === 'INITIATING') {
    const updatedAt = new Date(order.updatedAt).getTime();
    if (!Number.isFinite(updatedAt) || now() - updatedAt < INITIATION_LEASE_MS) {
      throw new PaymentInitiationError('Payment setup is already in progress. Please retry shortly.', 409);
    }

    await store.order.updateMany({
      where: {
        id: order.id,
        paymentStatus: 'INITIATING',
        updatedAt: { lte: new Date(now() - INITIATION_LEASE_MS) },
      },
      data: { paymentStatus: 'FAILED' },
    });

    order = await store.order.findUnique({
      where: { id: orderId },
      include: { payments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!order) throw new PaymentInitiationError('Order not found.', 404);
    ensureOrderEligible(order, customerId);
    if (order.paymentStatus !== 'FAILED') {
      throw new PaymentInitiationError('Payment setup changed while retrying. Please refresh the order.', 409);
    }
  }

  const claim = await store.order.updateMany({
    where: {
      id: order.id,
      customerId,
      financialDirection: 'CUSTOMER_PAYS',
      status: { notIn: ['CANCELLED', 'SETTLEMENT_COMPLETED'] },
      paymentStatus: { in: ['PENDING', 'FAILED', 'EXPIRED'] },
    },
    data: { paymentStatus: 'INITIATING' },
  });
  if (claim.count !== 1) {
    throw new PaymentInitiationError('A payment attempt is already processing or the order is no longer payable.', 409);
  }

  try {
    const razorpayOrder = await dependencies.createGatewayOrder({
      amountInPaise: Math.round(amount * 100),
      receipt: order.orderNumber,
      notes: { orderId: order.id, orderNumber: order.orderNumber },
    });

    if (
      !razorpayOrder.id ||
      razorpayOrder.amount !== Math.round(amount * 100) ||
      razorpayOrder.currency !== 'INR'
    ) {
      throw new Error('Razorpay returned an order that does not match the payable amount.');
    }

    const payment = await store.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          orderId,
          amount,
          direction: 'CUSTOMER_PAYS',
          gateway: 'RAZORPAY',
          gatewayOrderId: razorpayOrder.id,
          status: 'INITIATED',
        },
      });
      const finalized = await tx.order.updateMany({
        where: { id: order.id, paymentStatus: 'INITIATING' },
        data: { paymentStatus: 'INITIATED' },
      });
      if (finalized.count !== 1) {
        throw new Error('Payment initiation reservation was lost.');
      }
      return created;
    });

    return checkoutData(payment, order, razorpayOrder.keyId);
  } catch (error) {
    await store.order.updateMany({
      where: { id: order.id, paymentStatus: 'INITIATING' },
      data: { paymentStatus: 'FAILED' },
    }).catch(() => undefined);
    throw error;
  }
}
