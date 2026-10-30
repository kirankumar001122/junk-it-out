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

type SendLimit = { windowStartedAt: number; count: number; lastSentAt: number };
type VerifyLimit = { windowStartedAt: number; count: number };

// Abuse protection rate limits
const sendLimits = new Map<string, SendLimit>();
const verifyLimits = new Map<string, VerifyLimit>();

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
  const phoneRecord = sendLimits.get(phoneKey);
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
  if (ipKey) {
    const ipRecord = sendLimits.get(ipKey);
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
      return { success: false, status: 'provider_failed' as const, retryAfterSeconds: 0, errorDetails: provider.errorDetails };
    }
  } catch (err: any) {
    logStructured('error', 'auth.otp.send_exception', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });
    return { success: false, status: 'provider_failed' as const, retryAfterSeconds: 0, errorDetails: err.message };
  }

  // 3. Record send timestamps and increment counts
  sendLimits.set(
    phoneKey,
    phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, SEND_WINDOW_MS)
      ? { ...phoneRecord, count: phoneRecord.count + 1, lastSentAt: now }
      : { windowStartedAt: now, count: 1, lastSentAt: now }
  );

  if (ipKey) {
    const ipRecord = sendLimits.get(ipKey);
    sendLimits.set(
      ipKey,
      ipRecord && withinWindow(now, ipRecord.windowStartedAt, SEND_WINDOW_MS)
        ? { ...ipRecord, count: ipRecord.count + 1, lastSentAt: now }
        : { windowStartedAt: now, count: 1, lastSentAt: now }
    );
  }

  pruneLimits(sendLimits, SEND_WINDOW_MS);
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
  const phoneRecord = verifyLimits.get(phoneKey);
  if (phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, VERIFY_WINDOW_MS) && phoneRecord.count >= MAX_VERIFY_ATTEMPTS_PER_PHONE) {
    return { valid: false, status: 'rate_limited' as const };
  }

  // 2. Enforce IP-level verify attempt limit
  if (ipKey) {
    const ipRecord = verifyLimits.get(ipKey);
    if (ipRecord && withinWindow(now, ipRecord.windowStartedAt, VERIFY_WINDOW_MS) && ipRecord.count >= MAX_VERIFY_ATTEMPTS_PER_IP) {
      return { valid: false, status: 'rate_limited' as const };
    }
  }

  try {
    const provider = await verifyFast2SmsOtp(cleanPhoneDigits, cleanCode);
    if (provider.ok) {
      // Clear verification rate limit state on successful login
      verifyLimits.delete(phoneKey);
      return { valid: true, status: 'verified' as const };
    }
    logStructured('warn', 'auth.otp.verify_failed', { dependency: 'fast2sms' });
    return { valid: false, status: 'failed' as const, errorDetails: provider.errorDetails };
  } catch (err: any) {
    logStructured('error', 'auth.otp.verify_exception', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });
    return { valid: false, status: 'failed' as const, errorDetails: err.message };
  } finally {
    // Record failed verification attempt
    verifyLimits.set(
      phoneKey,
      phoneRecord && withinWindow(now, phoneRecord.windowStartedAt, VERIFY_WINDOW_MS)
        ? { ...phoneRecord, count: phoneRecord.count + 1 }
        : { windowStartedAt: now, count: 1 }
    );
    if (ipKey) {
      const ipRecord = verifyLimits.get(ipKey);
      verifyLimits.set(
        ipKey,
        ipRecord && withinWindow(now, ipRecord.windowStartedAt, VERIFY_WINDOW_MS)
          ? { ...ipRecord, count: ipRecord.count + 1 }
          : { windowStartedAt: now, count: 1 }
      );
    }
    pruneLimits(verifyLimits, VERIFY_WINDOW_MS);
  }
}

/** Exported strictly for testing resets */
export function _resetOtpRateLimitsForTesting(): void {
  sendLimits.clear();
  verifyLimits.clear();
}
