import { sendFast2SmsOtp, verifyFast2SmsOtp } from './fast2sms';
import { opaqueKey } from './requestSecurity';
import { getSafeErrorType, logStructured } from '../observability/structuredLogger';

const RESEND_COOLDOWN_MS = 30_000;
const SEND_WINDOW_MS = 10 * 60_000;
const MAX_SENDS_PER_PHONE_WINDOW = 5;
const MAX_SENDS_PER_IP_WINDOW = 15;

const VERIFY_WINDOW_MS = 10 * 60_000;
const MAX_VERIFY_ATTEMPTS_PER_PHONE = 5;
const MAX_VERIFY_ATTEMPTS_PER_IP = 25;

export const OTP_SEND_FAILURE_MESSAGE = 'Unable to send OTP. Please try again.';
export const OTP_VERIFY_FAILURE_MESSAGE = 'The OTP is invalid or expired. Please request a new code and try again.';

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

  clear(): void {
    this.store.clear();
  }

  getMap(): Map<string, T> {
    return this.store;
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

function withinWindow(now: number, startedAt: number, windowMs: number): boolean {
  return now - startedAt < windowMs;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function pruneLimits<T extends { windowStartedAt: number }>(map: Map<string, T>, windowMs: number): void {
  if (map.size > 200) {
    const now = Date.now();
    for (const [key, record] of map.entries()) {
      if (!withinWindow(now, record.windowStartedAt, windowMs)) {
        map.delete(key);
      }
    }
  }
}

export async function sendOtp(phone: string, clientIp: string) {
  const now = Date.now();
  const cleanPhoneDigits = normalizePhone(phone);
  const phoneKey = `phone:${opaqueKey(cleanPhoneDigits)}`;
  const isTrustedIp = Boolean(clientIp && clientIp !== 'unknown' && clientIp !== 'untrusted-client');
  const ipKey = isTrustedIp ? `ip:${opaqueKey(clientIp)}` : null;

  // 1. Enforce phone-level send rate limit
  const phoneRecord = await sendLimitStore.get(phoneKey);
  if (phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, SEND_WINDOW_MS)) {
    if (now - phoneRecord.lastSentAt < RESEND_COOLDOWN_MS) {
      return {
        success: false,
        status: 'cooldown' as const,
        retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - phoneRecord.lastSentAt)) / 1000),
      };
    }
    if (phoneRecord.count >= MAX_SENDS_PER_PHONE_WINDOW) {
      return {
        success: false,
        status: 'rate_limited' as const,
        retryAfterSeconds: Math.ceil((SEND_WINDOW_MS - (now - phoneRecord.windowStartedAt)) / 1000),
      };
    }
  }

  // 2. Enforce IP-level send rate limit (when trusted client IP is present)
  let ipRecord: SendLimit | undefined;
  if (ipKey) {
    ipRecord = await sendLimitStore.get(ipKey);
    if (ipRecord && withinWindow(now, ipRecord.windowStartedAt, SEND_WINDOW_MS)) {
      if (ipRecord.count >= MAX_SENDS_PER_IP_WINDOW) {
        return {
          success: false,
          status: 'rate_limited' as const,
          retryAfterSeconds: Math.ceil((SEND_WINDOW_MS - (now - ipRecord.windowStartedAt)) / 1000),
        };
      }
    }
  }

  try {
    const provider = await sendFast2SmsOtp(cleanPhoneDigits);
    if (!provider.ok) {
      logStructured('warn', 'auth.otp.send_failed', { dependency: 'fast2sms' });
      return {
        success: false,
        status: 'provider_failed' as const,
        retryAfterSeconds: 0,
        errorDetails: OTP_SEND_FAILURE_MESSAGE,
      };
    }
  } catch (err: any) {
    logStructured('error', 'auth.otp.send_exception', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });
    return {
      success: false,
      status: 'provider_failed' as const,
      retryAfterSeconds: 0,
      errorDetails: OTP_SEND_FAILURE_MESSAGE,
    };
  }

  // 3. Record send timestamps and increment counts
  await sendLimitStore.set(
    phoneKey,
    phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, SEND_WINDOW_MS)
      ? { ...phoneRecord, count: phoneRecord.count + 1, lastSentAt: now }
      : { windowStartedAt: now, count: 1, lastSentAt: now }
  );

  if (ipKey) {
    await sendLimitStore.set(
      ipKey,
      ipRecord && withinWindow(now, ipRecord.windowStartedAt, SEND_WINDOW_MS)
        ? { ...ipRecord, count: ipRecord.count + 1, lastSentAt: now }
        : { windowStartedAt: now, count: 1, lastSentAt: now }
    );
  }

  if (globalStore.__jioSendLimits) {
    pruneLimits(globalStore.__jioSendLimits, SEND_WINDOW_MS);
  }

  return { success: true, cooldownSeconds: RESEND_COOLDOWN_MS / 1000 };
}

export async function verifyOtp(phone: string, inputCode: string, clientIp: string) {
  const now = Date.now();
  const cleanPhoneDigits = normalizePhone(phone);
  const cleanCode = inputCode.trim();
  const phoneKey = `phone:${opaqueKey(cleanPhoneDigits)}`;
  const isTrustedIp = Boolean(clientIp && clientIp !== 'unknown' && clientIp !== 'untrusted-client');
  const ipKey = isTrustedIp ? `ip:${opaqueKey(clientIp)}` : null;

  // 1. Enforce phone-level verify attempt limit (blocks brute force even if attacker rotates IPs)
  const phoneRecord = await verifyLimitStore.get(phoneKey);
  if (phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, VERIFY_WINDOW_MS) && phoneRecord.count >= MAX_VERIFY_ATTEMPTS_PER_PHONE) {
    return { valid: false, status: 'rate_limited' as const };
  }

  // 2. Enforce IP-level verify attempt limit
  let ipRecord: VerifyLimit | undefined;
  if (ipKey) {
    ipRecord = await verifyLimitStore.get(ipKey);
    if (ipRecord && withinWindow(now, ipRecord.windowStartedAt, VERIFY_WINDOW_MS) && ipRecord.count >= MAX_VERIFY_ATTEMPTS_PER_IP) {
      return { valid: false, status: 'rate_limited' as const };
    }
  }

  try {
    const provider = await verifyFast2SmsOtp(cleanPhoneDigits, cleanCode);
    if (provider.ok) {
      // Clear verification rate limit state on successful login
      await verifyLimitStore.delete(phoneKey);
      return { valid: true, status: 'verified' as const };
    }
    logStructured('warn', 'auth.otp.verify_failed', { dependency: 'fast2sms' });
    return {
      valid: false,
      status: 'failed' as const,
      errorDetails: OTP_VERIFY_FAILURE_MESSAGE,
    };
  } catch (err: any) {
    logStructured('error', 'auth.otp.verify_exception', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });
    return {
      valid: false,
      status: 'failed' as const,
      errorDetails: OTP_VERIFY_FAILURE_MESSAGE,
    };
  } finally {
    // Record failed verification attempt
    await verifyLimitStore.set(
      phoneKey,
      phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, VERIFY_WINDOW_MS)
        ? { ...phoneRecord, count: phoneRecord.count + 1 }
        : { windowStartedAt: now, count: 1 }
    );
    if (ipKey) {
      await verifyLimitStore.set(
        ipKey,
        ipRecord && withinWindow(now, ipRecord.windowStartedAt, VERIFY_WINDOW_MS)
          ? { ...ipRecord, count: ipRecord.count + 1 }
          : { windowStartedAt: now, count: 1 }
      );
    }
    if (globalStore.__jioVerifyLimits) {
      pruneLimits(globalStore.__jioVerifyLimits, VERIFY_WINDOW_MS);
    }
  }
}

/** Exported strictly for testing resets */
export function _resetOtpRateLimitsForTesting(): void {
  if (globalStore.__jioSendLimits) {
    globalStore.__jioSendLimits.clear();
  }
  if (globalStore.__jioVerifyLimits) {
    globalStore.__jioVerifyLimits.clear();
  }
}
