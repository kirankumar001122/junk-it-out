import 'server-only';

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
    console.error('[FAST2SMS_CONFIG_ERROR] Configuration missing:', { hasApiKey, hasOtpId });
    throw new Error(`Fast2SMS OTP configuration missing (hasApiKey: ${hasApiKey}, hasOtpId: ${hasOtpId})`);
  }
  return { apiKey, otpId };
}

async function post(url: string, payload: Record<string, string>) {
  const { apiKey } = config();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    console.log('[FAST2SMS_REQUEST]', { url, payloadKeys: Object.keys(payload) });
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
      console.error('[FAST2SMS_RESPONSE_NOT_JSON]', { status: response.status, textSnippet: text.substring(0, 100) });
    }
    console.log('[FAST2SMS_RESPONSE]', {
      httpStatus: response.status,
      return: data.return,
      status_code: data.status_code,
      message: data.message || data.error || data.detail,
    });
    const ok = response.ok && data.return === true;
    return { ok, errorDetails: data.message || data.error || `HTTP ${response.status}` };
  } catch (err: any) {
    console.error('[FAST2SMS_FETCH_ERROR]', { url, error: err.message, name: err.name });
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
  return post(VERIFY_URL, { mobile: mobile.trim(), otp: otp.trim() });
}
