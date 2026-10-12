import { PaymentStateError, recordProviderPaymentStatus, type ProviderPaymentStatus } from './recordStatus';

export class RazorpayWebhookError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'RazorpayWebhookError';
    this.statusCode = statusCode;
  }
}

type WebhookDependencies = {
  store: any;
  verifySignature: (rawBody: string, signature: string) => boolean;
};

const EVENT_STATUSES: Record<string, { providerStatus: string; localStatus: ProviderPaymentStatus }> = {
  'payment.failed': { providerStatus: 'failed', localStatus: 'FAILED' },
  'payment.authorized': { providerStatus: 'authorized', localStatus: 'AUTHORIZED' },
  'payment.captured': { providerStatus: 'captured', localStatus: 'CAPTURED' },
};

export async function processRazorpayWebhook(
  rawBody: string,
  signature: string,
  dependencies: WebhookDependencies
) {
  if (!rawBody || !signature || !dependencies.verifySignature(rawBody, signature)) {
    throw new RazorpayWebhookError('Invalid webhook signature.', 400);
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new RazorpayWebhookError('Invalid webhook body.', 400);
  }

  const event = EVENT_STATUSES[body?.event];
  if (!event) return { status: 'Event ignored' };

  const entity = body?.payload?.payment?.entity;
  const gatewayOrderId = entity?.order_id;
  const providerPaymentId = entity?.id;
  if (typeof gatewayOrderId !== 'string' || !gatewayOrderId || typeof providerPaymentId !== 'string' || !providerPaymentId) {
    throw new RazorpayWebhookError('Webhook payment identifiers are missing.', 400);
  }
  if (
    entity.currency !== 'INR' ||
    !Number.isSafeInteger(entity.amount) ||
    entity.status !== event.providerStatus
  ) {
    throw new RazorpayWebhookError('Webhook payment details are invalid.', 400);
  }

  const payment = await dependencies.store.payment.findFirst({
    where: { gatewayOrderId, gateway: 'RAZORPAY', direction: 'CUSTOMER_PAYS' },
    select: { id: true, orderId: true, amount: true },
  });
  if (!payment) throw new RazorpayWebhookError('Payment order is not recognized.', 404);
  if (entity.amount !== Math.round(Number(payment.amount) * 100)) {
    throw new RazorpayWebhookError('Webhook payment amount does not match the local payment.', 400);
  }

  try {
    const result = await recordProviderPaymentStatus({
      store: dependencies.store,
      localPaymentId: payment.id,
      providerPaymentId,
      status: event.localStatus,
    });
    return { status: result.changed ? 'Webhook processed' : 'Already processed', paymentStatus: result.status };
  } catch (error) {
    if (error instanceof PaymentStateError) {
      throw new RazorpayWebhookError(error.message, error.statusCode);
    }
    throw error;
  }
}
