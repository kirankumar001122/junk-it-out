import { createHmac, timingSafeEqual } from 'crypto';

function requireCredentials() {
  const keyId =
    process.env.RAZORPAY_KEY_ID ||
    process.env.PAYMENT_KEY_ID;

  const secret =
    process.env.RAZORPAY_KEY_SECRET ||
    process.env.RAZORPAY_SECRET ||
    process.env.PAYMENT_KEY_SECRET;

  if (!keyId || !secret) {
    throw new Error(
      'Razorpay credentials are not configured on the server.'
    );
  }

  return {
    keyId,
    secret,
  };
}

function isValidSignature(
  payload: string,
  signature: string,
  secret: string
) {
  try {
    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(
      expectedBuffer,
      signatureBuffer
    );
  } catch {
    return false;
  }
}

// ---------------------------------------------------------
// CREATE RAZORPAY ORDER
// ---------------------------------------------------------

export async function createRazorpayOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId, secret } = requireCredentials();

  if (
    !Number.isInteger(input.amountInPaise) ||
    input.amountInPaise <= 0
  ) {
    throw new Error(
      'Invalid Razorpay order amount.'
    );
  }

  if (!input.receipt?.trim()) {
    throw new Error(
      'Razorpay order receipt is required.'
    );
  }

  const response = await fetch(
    'https://api.razorpay.com/v1/orders',
    {
      method: 'POST',
      headers: {
        Authorization:
          `Basic ${Buffer.from(
            `${keyId}:${secret}`
          ).toString('base64')}`,

        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        amount: input.amountInPaise,
        currency: 'INR',
        receipt: input.receipt,
        notes: input.notes,
      }),
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error(
      data?.error?.description ||
        'Razorpay order creation failed.'
    );
  }

  return {
    id: data.id as string,
    amount: data.amount as number,
    currency: data.currency as string,
    keyId,
  };
}

// ---------------------------------------------------------
// FETCH RAZORPAY PAYMENT
// ---------------------------------------------------------

export async function fetchRazorpayPayment(
  paymentId: string
) {
  const { keyId, secret } =
    requireCredentials();

  if (!paymentId?.trim()) {
    throw new Error(
      'Razorpay payment ID is required.'
    );
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(
      paymentId
    )}`,
    {
      method: 'GET',

      headers: {
        Authorization:
          `Basic ${Buffer.from(
            `${keyId}:${secret}`
          ).toString('base64')}`,
      },
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error(
      data?.error?.description ||
        'Unable to retrieve Razorpay payment.'
    );
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

// ---------------------------------------------------------
// VERIFY RAZORPAY PAYMENT SIGNATURE
// ---------------------------------------------------------

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
) {
  const { secret } =
    requireCredentials();

  if (
    !orderId ||
    !paymentId ||
    !signature
  ) {
    return false;
  }

  const payload =
    `${orderId}|${paymentId}`;

  return isValidSignature(
    payload,
    signature,
    secret
  );
}

// ---------------------------------------------------------
// VERIFY RAZORPAY WEBHOOK SIGNATURE
// ---------------------------------------------------------
//
// This uses a dedicated webhook secret.
// Do NOT invent a webhook secret if the founder has
// not provided/configured one.
//

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string
) {
  const webhookSecret =
    process.env.RAZORPAY_WEBHOOK_SECRET;

  if (
    !webhookSecret ||
    !signature ||
    !rawBody
  ) {
    return false;
  }

  return isValidSignature(
    rawBody,
    signature,
    webhookSecret
  );
}

// ---------------------------------------------------------
// GET RAZORPAY KEY ID
// ---------------------------------------------------------

export function getRazorpayKeyId() {
  return requireCredentials().keyId;
}

// ---------------------------------------------------------
// REFUND RAZORPAY PAYMENT
// ---------------------------------------------------------

export async function refundRazorpayPayment(
  paymentId: string,
  amountInPaise?: number,
  notes?: Record<string, string>
) {
  const { keyId, secret } =
    requireCredentials();

  if (!paymentId?.trim()) {
    throw new Error(
      'Razorpay payment ID is required.'
    );
  }

  const body: {
    amount?: number;
    notes?: Record<string, string>;
  } = {};

  if (
    amountInPaise !== undefined
  ) {
    if (
      !Number.isInteger(amountInPaise) ||
      amountInPaise <= 0
    ) {
      throw new Error(
        'Invalid refund amount.'
      );
    }

    body.amount = amountInPaise;
  }

  if (notes) {
    body.notes = notes;
  }

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(
      paymentId
    )}/refund`,
    {
      method: 'POST',

      headers: {
        Authorization:
          `Basic ${Buffer.from(
            `${keyId}:${secret}`
          ).toString('base64')}`,

        'Content-Type': 'application/json',
      },

      body: JSON.stringify(body),
    }
  );

  const data = await response
    .json()
    .catch(() => null);

  if (!response.ok || !data?.id) {
    throw new Error(
      data?.error?.description ||
        'Razorpay refund failed.'
    );
  }

  return {
    id: data.id as string,
    entity: data.entity as string,
    amount: data.amount as number,
    currency: data.currency as string,
    payment_id: data.payment_id as string,
    status: data.status as string,
  };
}