import 'server-only';
import { getSafeErrorType, logStructured } from '../observability/structuredLogger';

const FAST2SMS_WHATSAPP_URL = 'https://www.fast2sms.com/dev/whatsapp';
const REQUEST_TIMEOUT_MS = 10_000;

export interface SendDispatchUpdateInput {
  customerPhone: string;
  customerName: string;
  agentName: string;
  agentPhone: string;
  estimatedArrival?: string;
  orderNumber?: string;
}

export interface WhatsAppServiceResult {
  success: boolean;
  requestId?: string;
  message?: string;
  error?: string;
}

/**
 * Normalizes destination phone number for Fast2SMS WhatsApp API (10 to 12 digits without leading '+')
 */
function normalizePhoneNumber(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  // If 10 digits (e.g. 9876543210), return as is
  if (digitsOnly.length === 10) return digitsOnly;
  // If 12 digits starting with 91 (e.g. 919876543210), return as is
  if (digitsOnly.length === 12 && digitsOnly.startsWith('91')) return digitsOnly;
  // If 11 digits starting with 0 (e.g. 09876543210), strip leading 0
  if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) return digitsOnly.substring(1);
  return digitsOnly;
}

/**
 * Clean agent phone for template variable {{3}}
 * Template string: "📞 Contact: +{{3}}"
 * Ensures +{{3}} expands cleanly to e.g. "+919876543210"
 */
function formatAgentPhoneForTemplate(phone: string): string {
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }
  return digitsOnly;
}

/**
 * Backend service to send Fast2SMS WhatsApp Dispatch Update (Message ID: 25045)
 */
export async function sendDispatchUpdate(
  input: SendDispatchUpdateInput
): Promise<WhatsAppServiceResult> {
  try {
    const apiKey = (
      process.env.FAST2SMS_WHATSAPP_API_KEY ||
      process.env.FAST2SMS_API_KEY ||
      ''
    ).trim();

    const messageId = (
      process.env.FAST2SMS_WHATSAPP_MESSAGE_ID ||
      '25045'
    ).trim();

    const phoneNumberId = (
      process.env.FAST2SMS_WHATSAPP_PHONE_NUMBER_ID ||
      '1238240156029770'
    ).trim();

    if (!apiKey) {
      logStructured('warn', 'notification.whatsapp.configuration_missing', { dependency: 'fast2sms' });
      return {
        success: false,
        error: 'FAST2SMS_API_KEY missing in server environment.',
      };
    }

    if (!input.customerPhone || input.customerPhone.trim() === '') {
      return {
        success: false,
        error: 'Customer mobile number is missing.',
      };
    }

    const normalizedCustomerPhone = normalizePhoneNumber(input.customerPhone);
    const cleanCustomerName = (input.customerName || 'Valued Customer').trim();
    const cleanAgentName = (input.agentName || 'Field Agent').trim();
    const cleanAgentPhone = formatAgentPhoneForTemplate(input.agentPhone || '');
    const cleanEta = (input.estimatedArrival || '20-30 mins').trim();

    // Template Variable Mapping: {{1}}|{{2}}|{{3}}|{{4}}
    // {{1}} = Customer Name
    // {{2}} = Agent/Partner Name
    // {{3}} = Agent/Partner Phone Number
    // {{4}} = Estimated Arrival
    const variablesValues = `${cleanCustomerName}|${cleanAgentName}|${cleanAgentPhone}|${cleanEta}`;

    const params = new URLSearchParams({
      message_id: messageId,
      phone_number_id: phoneNumberId,
      numbers: normalizedCustomerPhone,
      variables_values: variablesValues,
    });

    const targetUrl = `${FAST2SMS_WHATSAPP_URL}?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    logStructured('info', 'notification.whatsapp.request_started', { dependency: 'fast2sms' });

    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const responseText = await response.text();
    let responseData: any = {};
    try {
      responseData = JSON.parse(responseText);
    } catch {
      // Non-JSON response
    }

    const requestId =
      responseData.request_id ||
      responseData.requestId ||
      (Array.isArray(responseData.data) && responseData.data[0]?.request_id) ||
      undefined;

    const isSuccess =
      response.ok &&
      (responseData.return === true ||
        String(responseData.return).toLowerCase() === 'true' ||
        responseData.status_code === 200);

    logStructured(isSuccess ? 'info' : 'warn', 'notification.whatsapp.response', {
      dependency: 'fast2sms',
      providerStatusCode: Number.isInteger(responseData.status_code)
        ? responseData.status_code
        : response.status,
    });

    if (isSuccess) {
      return {
        success: true,
        requestId,
        message: 'WhatsApp Dispatch Update delivered successfully.',
      };
    } else {
      const errMsg =
        responseData.message ||
        responseData.error ||
        responseData.detail ||
        `HTTP ${response.status}`;

      return {
        success: false,
        requestId,
        error: typeof errMsg === 'object' ? JSON.stringify(errMsg) : String(errMsg),
      };
    }
  } catch (err: any) {
    logStructured('error', 'notification.whatsapp.failed', {
      dependency: 'fast2sms',
      errorType: getSafeErrorType(err),
    });

    return {
      success: false,
      error: err.message || 'Network exception calling Fast2SMS API.',
    };
  }
}
