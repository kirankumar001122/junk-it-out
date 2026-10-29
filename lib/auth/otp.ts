import { sendFast2SmsOtp, verifyFast2SmsOtp } from './fast2sms';
import { opaqueKey } from './requestSecurity';

const RESEND_COOLDOWN_MS = 30_000;
const SEND_WINDOW_MS = 10 * 60_000;
const MAX_SENDS_PER_WINDOW = 5;
const VERIFY_WINDOW_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS = 5;

export type SendLimit = { windowStartedAt: number; count: number; lastSentAt: number };
export type VerifyLimit = { windowStartedAt: number; count: number };

/**
 * Pluggable rate limit store interface to allow swapping in-memory maps
 * with distributed stores (e.g. Redis / Upstash) for horizontal scaling.
 */
export interface RateLimitStore<T> {
  get(key: string): Promise<T | undefined> | (T | undefined);
  set(key: string, value: T): Promise<void> | void;
  delete(key: string): Promise<void> | void;
}

export class InMemoryRateLimitStore<T> implements RateLimitStore<T> {
  private store: Map<string, T>;

  constructor(sharedMap?: Map<string, T>) {
    this.store = sharedMap ?? new Map<string, T>();
  }

  get(key: string): T | undefined {
    return this.store.get(key);
  }

  set(key: string, value: T): void {
    this.store.set(key, value);
  }

  delete(key: string): void {
    this.store.delete(key);
  }
}

// Global singletons to prevent throttle resets across Next.js dev reloads
const globalStore = globalThis as unknown as {
  __jioSendLimits?: Map<string, SendLimit>;
  __jioVerifyLimits?: Map<string, VerifyLimit>;
};

const sendLimitStore: RateLimitStore<SendLimit> = new InMemoryRateLimitStore(
  globalStore.__jioSendLimits ?? (globalStore.__jioSendLimits = new Map<string, SendLimit>())
);

const verifyLimitStore: RateLimitStore<VerifyLimit> = new InMemoryRateLimitStore(
  globalStore.__jioVerifyLimits ?? (globalStore.__jioVerifyLimits = new Map<string, VerifyLimit>())
);

function withinWindow(now: number, startedAt: number, windowMs: number) {
  return now - startedAt < windowMs;
}

export async function sendOtp(phone: string, clientIp: string) {
  const now = Date.now();
  const key = `${opaqueKey(phone)}:${opaqueKey(clientIp)}`;
  const existing = await sendLimitStore.get(key);
  if (existing && withinWindow(now, existing.windowStartedAt, SEND_WINDOW_MS)) {
    if (now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
      return {
        success: false,
        status: 'cooldown' as const,
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000),
      };
    }
    if (existing.count >= MAX_SENDS_PER_WINDOW) {
      return {
        success: false,
        status: 'rate_limited' as const,
        retryAfterSeconds: Math.ceil((SEND_WINDOW_MS - (now - existing.windowStartedAt)) / 1000),
      };
    }
  }

  try {
    const provider = await sendFast2SmsOtp(phone.replace(/^\+91/, ''));
    if (!provider.ok) {
      console.error('[SEND_OTP_PROVIDER_FAILED]', { errorDetails: provider.errorDetails });
      return {
        success: false,
        status: 'provider_failed' as const,
        retryAfterSeconds: 0,
        errorDetails: provider.errorDetails,
      };
    }
  } catch (err: any) {
    console.error('[SEND_OTP_EXCEPTION]', { error: err.message });
    return {
      success: false,
      status: 'provider_failed' as const,
      retryAfterSeconds: 0,
      errorDetails: err.message,
    };
  }

  await sendLimitStore.set(
    key,
    existing && withinWindow(now, existing.windowStartedAt, SEND_WINDOW_MS)
      ? { ...existing, count: existing.count + 1, lastSentAt: now }
      : { windowStartedAt: now, count: 1, lastSentAt: now }
  );
  return { success: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function verifyOtp(phone: string, inputCode: string, clientIp: string) {
  const now = Date.now();
  const key = `${opaqueKey(phone)}:${opaqueKey(clientIp)}`;
  const existing = await verifyLimitStore.get(key);
  if (existing && withinWindow(now, existing.windowStartedAt, VERIFY_WINDOW_MS) && existing.count >= MAX_VERIFY_ATTEMPTS) {
    return { valid: false, status: 'rate_limited' as const };
  }

  const cleanPhone = phone.replace(/^\+91/, '').trim();
  const cleanCode = inputCode.trim();

  try {
    const provider = await verifyFast2SmsOtp(cleanPhone, cleanCode);
    if (provider.ok) {
      await verifyLimitStore.delete(key);
      return { valid: true, status: 'verified' as const };
    }
    console.warn('[VERIFY_OTP_FAILED_PROVIDER]', { errorDetails: provider.errorDetails });
    return { valid: false, status: 'failed' as const, errorDetails: provider.errorDetails };
  } catch (err: any) {
    console.error('[VERIFY_OTP_EXCEPTION]', { error: err.message });
    return { valid: false, status: 'failed' as const, errorDetails: err.message };
  } finally {
    await verifyLimitStore.set(
      key,
      existing && withinWindow(now, existing.windowStartedAt, VERIFY_WINDOW_MS)
        ? { ...existing, count: existing.count + 1 }
        : { windowStartedAt: now, count: 1 }
    );
  }
}
