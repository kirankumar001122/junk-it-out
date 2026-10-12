import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyRazorpayWebhookSignature } from '@/lib/payments/razorpay';
import { processRazorpayWebhook, RazorpayWebhookError } from '@/lib/payments/webhook';

export async function POST(req: NextRequest) {
  try {
    // Razorpay signs the exact request bytes. Do not parse/reserialize first.
    const rawBody = await req.text();
    const signature = req.headers.get('x-razorpay-signature') || '';
    const result = await processRazorpayWebhook(rawBody, signature, {
      store: db,
      verifySignature: verifyRazorpayWebhookSignature,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    const status = error instanceof RazorpayWebhookError ? error.statusCode : 500;
    const message = error instanceof RazorpayWebhookError
      ? error.message
      : 'Unable to process payment notification.';
    return NextResponse.json({ success: false, message }, { status });
  }
}
