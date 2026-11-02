import 'server-only';
import { getSafeErrorType, logStructured } from '../observability/structuredLogger';

const SEND_URL = 'https://www.fast2sms.com/dev/otp/send';
const VERIFY_URL = 'https://www.fast2sms.com/dev/otp/verify';
const REQUEST_TIMEOUT_MS = 10_000;

type Fast2SmsResponse = { return?: boolean; status_code?: number; message?: any; error?: any; detail?: any };

function config() {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  const otpId = process.env.FAST2SMS_OTP_ID?.trim();
  const hasApiKey = Boolean(apiKey);
  const hasOtpId = Boolean(otpId);
  if (!apiKey || !otpId) {
    logStructured('error', 'auth.otp.configuration_missing', { dependency: 'fast2sms' });
    throw new Error(`Fast2SMS OTP configuration missing (hasApiKey: ${hasApiKey}, hasOtpId: ${hasOtpId})`);
  }
  return { apiKey, otpId };
}

async function post(url: string, payload: Record<string, string>) {
  const { apiKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    logStructured('info', 'auth.otp.provider_request_started', { dependency: 'fast2sms' });
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: apiKey, Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      cache: 'no-store',
      signal: controller.signal,
    });
    const text = await response.text();
    let data: Fast2SmsResponse = {};
    try {
      data = JSON.parse(text);
    } catch {
      logStructured('warn', 'auth.otp.provider_response_invalid', {
        dependency: 'fast2sms',
        providerStatusCode: response.status,
      });
    }
    const isReturnTrue = data.return === true || String(data.return).toLowerCase() === 'true';
    const isStatusCodeOk = data.status_code === 200;
    const isMessageSuccess = Array.isArray(data.message)
      ? data.message.some((m: any) => String(m).toLowerCase().includes('success') || String(m).toLowerCase().includes('sent'))
      : typeof data.message === 'string' && (data.message.toLowerCase().includes('success') || data.message.toLowerCase().includes('sent'));
    const isRequestIdPresent = Boolean((data as any).request_id);

    const ok = response.ok && (isReturnTrue || isStatusCodeOk || isMessageSuccess || isRequestIdPresent);
    logStructured(ok ? 'info' : 'warn', 'auth.otp.provider_response', {
      dependency: 'fast2sms',
      providerStatusCode: Number.isInteger(data.status_code) ? data.status_code : response.status,
    });
    const rawMsg = data.message || data.error || data.detail;
    const errorDetails = Array.isArray(rawMsg) ? rawMsg.join(', ') : typeof rawMsg === 'object' ? JSON.stringify(rawMsg) : String(rawMsg || `HTTP ${response.status}`);

    return { ok, errorDetails };
  } catch (err: any) {
    logStructured('error', 'auth.otp.provider_request_failed', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });
    return { ok: false, errorDetails: err.message };
  } finally {
    clearTimeout(timeout);
  }
}

/** Fast2SMS owns OTP generation, storage, expiry, and comparison. */
export async function sendFast2SmsOtp(mobile: string) {
  const { otpId } = config();
  return post(SEND_URL, { mobile, otp_id: otpId });
}

export async function verifyFast2SmsOtp(mobile: string, otp: string) {
  const { otpId } = config();
  return post(VERIFY_URL, { mobile: mobile.trim(), otp: otp.trim(), otp_id: otpId });
}
