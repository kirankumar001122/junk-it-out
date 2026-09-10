import { createHmac, timingSafeEqual } from 'crypto';

function requireCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID || process.env.PAYMENT_KEY_ID;
  const secret = process.env.RAZORPAY_SECRET || process.env.PAYMENT_KEY_SECRET;

  if (!keyId || !secret) {
    throw new Error('Razorpay credentials are not configured on the server.');
  }

  return { keyId, secret };
}

function isValidSignature(payload: string, signature: string, secret: string) {
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  const signatureBuffer = Buffer.from(signature, 'utf8');
  return expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
}

export async function createRazorpayOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, secret } = requireCredentials();
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      amount: input.amountInPaise,
      currency: 'INR',
      receipt: input.receipt,
      notes: input.notes,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.description || 'Razorpay order creation failed.');
  }

  return { id: data.id as string, amount: data.amount as number, currency: data.currency as string, keyId };
}

export async function fetchRazorpayPayment(paymentId: string) {
  const { keyId, secret } = requireCredentials();
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.id) {
    throw new Error(data?.error?.description || 'Unable to retrieve Razorpay payment.');
  }
  return data as {
    id: string;
    order_id: string;
    amount: number;
    currency: string;
    status: string;
    method?: string;
  };
}

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const { secret } = requireCredentials();
  return isValidSignature(`${orderId}|${paymentId}`, signature, secret);
}

export function verifyRazorpayWebhookSignature(rawBody: string, signature: string) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || process.env.RAZORPAY_SECRET || process.env.PAYMENT_KEY_SECRET;
  if (!webhookSecret || !signature) return false;
  return isValidSignature(rawBody, signature, webhookSecret);
}

export function getRazorpayKeyId() {
  return requireCredentials().keyId;
}
