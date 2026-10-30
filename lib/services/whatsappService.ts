import 'server-only';

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
 * Safely masks a phone number for privacy in server logs.
 * Example: "+919876543210" -> "+91 98****3210"
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return '***';
  const clean = phone.replace(/\s+/g, '');
  const start = clean.slice(0, 4);
  const end = clean.slice(-4);
  return `${start}****${end}`;
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
      console.warn(
        '[WHATSAPP_CONFIG_NOTICE] Fast2SMS API key missing in environment variables. WhatsApp dispatch notification skipped.'
      );
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

    console.log('[WHATSAPP_DISPATCH_REQUEST]', {
      messageId,
      phoneNumberId,
      maskedCustomerPhone: maskPhone(input.customerPhone),
      orderNumber: input.orderNumber || 'N/A',
    });

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

    console.log('[WHATSAPP_DISPATCH_RESPONSE]', {
      httpStatus: response.status,
      returnStatus: responseData.return,
      statusCode: responseData.status_code,
      requestId: requestId || 'N/A',
      orderNumber: input.orderNumber || 'N/A',
    });

    const isSuccess =
      response.ok &&
      (responseData.return === true ||
        String(responseData.return).toLowerCase() === 'true' ||
        responseData.status_code === 200);

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
    console.error('[WHATSAPP_SERVICE_ERROR]', {
      error: err.message || 'Unknown network error',
      orderNumber: input.orderNumber || 'N/A',
    });

    return {
      success: false,
      error: err.message || 'Network exception calling Fast2SMS API.',
    };
  }
}
