import { createHash } from 'node:crypto';

const recentEscalations = new Map<string, number>();
const DEDUPE_WINDOW_MS = 10 * 60 * 1000;

function getWebhookUrl(): URL | null {
  const configured = process.env.SUPPORT_ESCALATION_WEBHOOK_URL;
  if (!configured) return null;

  try {
    const url = new URL(configured);
    if (url.protocol !== 'https:' && !(url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export async function notifySupportEscalation(input: {
  customerName: string;
  customerPhone: string;
  orderId?: string | null;
  question: string;
  summary: string;
  ticketId: string;
}): Promise<'sent' | 'duplicate' | 'not_configured' | 'failed'> {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return 'not_configured';

  const dedupeKey = createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
  const now = Date.now();
  for (const [key, expiresAt] of recentEscalations) {
    if (expiresAt <= now) recentEscalations.delete(key);
  }
  if (recentEscalations.has(dedupeKey)) return 'duplicate';
  recentEscalations.set(dedupeKey, now + DEDUPE_WINDOW_MS);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.SUPPORT_ESCALATION_WEBHOOK_SECRET
          ? { Authorization: `Bearer ${process.env.SUPPORT_ESCALATION_WEBHOOK_SECRET}` }
          : {}),
      },
      body: JSON.stringify({
        to: 'support@junkitout.in',
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        orderId: input.orderId || null,
        question: input.question,
        summary: input.summary,
        ticketId: input.ticketId,
        escalatedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn(JSON.stringify({
        event: 'support.escalation.webhook_failed',
        status: response.status,
      }));
      return 'failed';
    }
    return 'sent';
  } catch (error) {
    console.warn(JSON.stringify({
      event: 'support.escalation.webhook_error',
      error: error instanceof Error ? error.name : 'unknown',
    }));
    return 'failed';
  } finally {
    clearTimeout(timeout);
  }
}
