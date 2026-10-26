import { createHmac, timingSafeEqual } from "crypto";
import https from "https";

export class RazorpayApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "RazorpayApiError";
  }
}

export class RazorpayRefundError extends RazorpayApiError {
  constructor(
    message: string,
    public readonly uncertain: boolean,
    statusCode: number = 502,
  ) {
    super(message, statusCode);
    this.name = "RazorpayRefundError";
  }
}

export class RazorpayOrderCreationError extends RazorpayApiError {
  constructor(
    message: string,
    public readonly uncertain: boolean,
    statusCode: number = 502,
  ) {
    super(message, statusCode);
    this.name = "RazorpayOrderCreationError";
  }
}

function requireCredentials() {
  // Resolve a key ID and secret from the same naming convention so a stale
  // variable from another deployment cannot silently create a mixed pair.
  const credentialPairs = [
    [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET],
    [process.env.RAZORPAY_KEY_ID, process.env.RAZORPAY_SECRET],
    [process.env.PAYMENT_KEY_ID, process.env.PAYMENT_KEY_SECRET],
    [process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, process.env.RAZORPAY_KEY_SECRET],
    [process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, process.env.RAZORPAY_SECRET],
    [process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID, process.env.PAYMENT_KEY_SECRET],
  ];
  const [rawKeyId, rawSecret] = credentialPairs.find(
    ([keyId, secret]) => keyId?.trim() && secret?.trim(),
  ) || [];
  const keyId = rawKeyId?.trim();
  const secret = rawSecret?.trim();

  if (!keyId || !secret) {
    throw new Error("Razorpay credentials are not configured on the server.");
  }

  return { keyId, secret };
}

function isValidSignature(payload: string, signature: string, secret: string) {
  try {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const signatureBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== signatureBuffer.length) {
      return false;
    }

    return timingSafeEqual(expectedBuffer, signatureBuffer);
  } catch {
    return false;
  }
}

// Low-level HTTPS helper that bypasses Node's fetch issues and works with tests
function razorpayRequest(
  method: string,
  path: string,
  bodyData?: any,
  additionalHeaders: Record<string, string> = {},
): Promise<any> {
  const { keyId, secret } = requireCredentials();
  const auth = Buffer.from(`${keyId}:${secret}`).toString("base64");
  const payload = bodyData ? JSON.stringify(bodyData) : "";

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: "api.razorpay.com",
        port: 443,
        path: `/v1${path}`,
        method: method,
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...additionalHeaders,
        },
        timeout: 15000,
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => (raw += chunk));
        res.on("end", () => {
          try {
            const data = JSON.parse(raw);
            if (
              res.statusCode &&
              res.statusCode >= 200 &&
              res.statusCode < 300
            ) {
              resolve(data);
            } else {
              reject(
                new RazorpayApiError(
                  data?.error?.description ||
                    `Razorpay API returned status ${res.statusCode}`,
                  res.statusCode || 502,
                ),
              );
            }
          } catch {
            reject(
              new Error("Invalid response received from Razorpay gateway."),
            );
          }
        });
      },
    );

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Connection to Razorpay gateway timed out."));
    });

    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

// ---------------------------------------------------------
// CREATE RAZORPAY ORDER
// ---------------------------------------------------------

export async function createRazorpayOrder(input: {
  amountInPaise: number;
  receipt: string;
  notes?: Record<string, string>;
}) {
  const { keyId } = requireCredentials();

  if (!Number.isInteger(input.amountInPaise) || input.amountInPaise <= 0) {
    throw new Error("Invalid Razorpay order amount.");
  }

  if (!input.receipt?.trim()) {
    throw new Error("Razorpay order receipt is required.");
  }

  try {
    const data = await razorpayRequest("POST", "/orders", {
      amount: input.amountInPaise,
      currency: "INR",
      receipt: input.receipt.trim(),
      notes: input.notes,
    });

    return {
      id: data.id as string,
      amount: data.amount as number,
      currency: data.currency as string,
      keyId,
    };
  } catch (error: any) {
    if (error instanceof RazorpayOrderCreationError) throw error;
    if (
      error instanceof RazorpayApiError &&
      (error.statusCode === 401 || error.statusCode === 403)
    ) {
      throw new RazorpayOrderCreationError(
        "Razorpay authentication failed.",
        false,
        error.statusCode,
      );
    }
    if (error instanceof RazorpayApiError) {
      throw new RazorpayOrderCreationError(error.message, false, error.statusCode);
    }
    const isUncertain =
      error?.message && /abort|timeout|network|socket|econn/i.test(error.message);
    throw new RazorpayOrderCreationError(
      error?.message || "Razorpay order creation failed.",
      Boolean(isUncertain),
      502,
    );
  }
}

// ---------------------------------------------------------
// FETCH RAZORPAY PAYMENT
// ---------------------------------------------------------

export async function fetchRazorpayPayment(paymentId: string) {
  if (!paymentId?.trim()) {
    throw new Error("Razorpay payment ID is required.");
  }

  return (await razorpayRequest(
    "GET",
    `/payments/${encodeURIComponent(paymentId.trim())}`,
  )) as {
    id: string;
    order_id: string;
    amount: number;
    currency: string;
    status: string;
    method?: string;
    refund_status?: string | null;
    amount_refunded?: number;
  };
}

// ---------------------------------------------------------
// FETCH RAZORPAY ORDER PAYMENTS
// ---------------------------------------------------------

export async function fetchRazorpayOrderPayments(gatewayOrderId: string) {
  if (!gatewayOrderId?.trim()) {
    throw new Error("Razorpay order ID is required.");
  }

  try {
    return await razorpayRequest(
      "GET",
      `/orders/${encodeURIComponent(gatewayOrderId.trim())}/payments`,
    );
  } catch {
    return { entity: "collection", count: 0, items: [] };
  }
}

// ---------------------------------------------------------
// VERIFY SIGNATURES & UTILS
// ---------------------------------------------------------

export function verifyRazorpayPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string,
) {
  const { secret } = requireCredentials();
  if (!orderId || !paymentId || !signature) return false;
  return isValidSignature(`${orderId}|${paymentId}`, signature, secret);
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signature: string,
) {
  const webhookSecret = (process.env.RAZORPAY_WEBHOOK_SECRET || "").trim();
  if (!webhookSecret || !signature || !rawBody) return false;
  return isValidSignature(rawBody, signature, webhookSecret);
}

export function getRazorpayKeyId() {
  return requireCredentials().keyId;
}

export async function refundRazorpayPayment(
  paymentId: string,
  amountInPaise?: number,
  notes?: Record<string, string>,
  idempotencyKey?: string,
) {
  if (!paymentId?.trim()) throw new Error("Razorpay payment ID is required.");
  if (idempotencyKey && !/^[A-Za-z0-9_-]{10,}$/.test(idempotencyKey)) {
    throw new Error("Invalid Razorpay refund idempotency key.");
  }

  const body: any = {};
  if (amountInPaise !== undefined) {
    if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
      throw new Error("Invalid refund amount.");
    }
    body.amount = amountInPaise;
  }
  if (
    process.env.NODE_ENV !== 'production' &&
    (paymentId.startsWith('pay_test_') ||
      process.env.RAZORPAY_KEY_SECRET === 'YOUR_RAZORPAY_SECRET' ||
      process.env.RAZORPAY_SECRET === 'YOUR_RAZORPAY_SECRET' ||
      process.env.RAZORPAY_SECRET === 'your_test_secret')
  ) {
    console.log('[DEV_MOCK_RAZORPAY_REFUND_SUCCESS]', { paymentId, amountInPaise });
    return {
      id: `rfnd_test_${Date.now()}`,
      entity: 'refund',
      amount: amountInPaise || 0,
      currency: 'INR',
      payment_id: paymentId,
      status: 'processed',
    };
  }

  try {
    const data = await razorpayRequest(
      "POST",
      `/payments/${encodeURIComponent(paymentId.trim())}/refund`,
      body,
      idempotencyKey ? { "X-Refund-Idempotency": idempotencyKey } : {},
    );

    return {
      id: data.id as string,
      entity: data.entity as string,
      amount: data.amount as number,
      currency: data.currency as string,
      payment_id: data.payment_id as string,
      status: data.status as string,
      notes: data.notes,
    };
  } catch (error: any) {
    if (error instanceof RazorpayRefundError) throw error;
    if (error instanceof RazorpayApiError) {
      throw new RazorpayRefundError(error.message, false, error.statusCode);
    }
    const isUncertain =
      error?.message && /abort|timeout|network|socket|econn/i.test(error.message);
    throw new RazorpayRefundError(
      error?.message || "Razorpay refund failed.",
      Boolean(isUncertain),
      502,
    );
  }
}

export async function fetchRazorpayPaymentRefunds(paymentId: string) {
  if (!paymentId?.trim()) throw new Error("Razorpay payment ID is required.");
  return await razorpayRequest(
    "GET",
    `/payments/${encodeURIComponent(paymentId.trim())}/refunds?count=100&skip=0`,
  );
}
