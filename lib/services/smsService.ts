import 'server-only';
import { getSafeErrorType, logStructured } from '../observability/structuredLogger';

const FAST2SMS_URL = 'https://www.fast2sms.com/dev/bulkV2';
const REQUEST_TIMEOUT_MS = 10_000;

export type AgentAssignmentSmsInput = {
  agentPhone: string;
  message: string;
};

export type SmsServiceResult = {
  success: boolean;
  requestId?: string;
  error?: string;
};

function normalizeIndianMobile(phone: string) {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('91') && digits.length === 12
    ? digits.slice(2)
    : digits.startsWith('0') && digits.length === 11
      ? digits.slice(1)
      : digits;

  return /^[6-9]\d{9}$/.test(normalized) ? normalized : null;
}

export async function sendAgentAssignmentSms(
  input: AgentAssignmentSmsInput,
): Promise<SmsServiceResult> {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  const messageId = process.env.FAST2SMS_AGENT_SMS_MESSAGE_ID?.trim();
  const senderId = process.env.FAST2SMS_AGENT_SMS_SENDER_ID?.trim();
  const route = process.env.FAST2SMS_AGENT_SMS_ROUTE?.trim() || 'dlt';
  const recipient = normalizeIndianMobile(input.agentPhone);

  if (!apiKey || !messageId || !senderId) {
    logStructured('warn', 'notification.agent_sms.configuration_missing', {
      dependency: 'fast2sms',
    });
    return {
      success: false,
      error: 'Agent SMS configuration is missing.',
    };
  }

  if (!recipient) {
    logStructured('warn', 'notification.agent_sms.invalid_recipient', {
      dependency: 'fast2sms',
    });
    return {
      success: false,
      error: 'Agent mobile number is invalid.',
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(FAST2SMS_URL, {
      method: 'POST',
      headers: {
        authorization: apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        route,
        sender_id: senderId,
        message: messageId,
        variables_values: input.message,
        numbers: recipient,
      }),
      cache: 'no-store',
      signal: controller.signal,
    });

    const responseText = await response.text();
    let responseData: {
      return?: boolean | string;
      status_code?: number;
      request_id?: string;
      message?: unknown;
      error?: unknown;
    } = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      logStructured('warn', 'notification.agent_sms.provider_response_invalid', {
        dependency: 'fast2sms',
        providerStatusCode: response.status,
      });
    }

    const success = response.ok && (
      responseData.return === true ||
      String(responseData.return).toLowerCase() === 'true' ||
      responseData.status_code === 200
    );
    const requestId = responseData.request_id;
    logStructured(success ? 'info' : 'warn', 'notification.agent_sms.provider_response', {
      dependency: 'fast2sms',
      providerStatusCode: Number.isInteger(responseData.status_code)
        ? responseData.status_code
        : response.status,
    });

    if (success) return { success: true, requestId };

    const providerMessage = responseData.message || responseData.error;
    return {
      success: false,
      requestId,
      error: typeof providerMessage === 'string'
        ? providerMessage
        : `Fast2SMS request failed with HTTP ${response.status}.`,
    };
  } catch (error) {
    logStructured('error', 'notification.agent_sms.provider_failed', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(error),
    });
    return {
      success: false,
      error: 'Fast2SMS request failed.',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function normalizeAgentSmsPhone(phone: string) {
  return normalizeIndianMobile(phone);
}
