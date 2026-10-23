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

// Low-level HTTPS helper that bypasses Node's fetch issues
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
        timeout: 5000,
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

  const data = await razorpayRequest("POST", "/orders", {
    amount: input.amountInPaise,
    currency: "INR",
    receipt: input.receipt,
    notes: input.notes,
  });

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

export async function fetchRazorpayPayment(paymentId: string) {
  if (!paymentId?.trim()) {
    throw new Error("Razorpay payment ID is required.");
  }

  return await razorpayRequest(
    "GET",
    `/payments/${encodeURIComponent(paymentId)}`,
  );
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
      `/orders/${encodeURIComponent(gatewayOrderId)}/payments`,
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
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
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
  if (amountInPaise !== undefined) body.amount = amountInPaise;
  if (notes) body.notes = notes;

  return await razorpayRequest(
    "POST",
    `/payments/${encodeURIComponent(paymentId)}/refund`,
    body,
    idempotencyKey ? { "X-Refund-Idempotency": idempotencyKey } : {},
  );
}

export async function fetchRazorpayPaymentRefunds(paymentId: string) {
  if (!paymentId?.trim()) throw new Error("Razorpay payment ID is required.");
  return await razorpayRequest(
    "GET",
    `/payments/${encodeURIComponent(paymentId)}/refunds?count=100&skip=0`,
  );
}
