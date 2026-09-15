import { NextRequest } from 'next/server';
import { sendOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getClientIp, hasTrustedOrigin } from '@/lib/auth/requestSecurity';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedOrigin(req)) {
      return errorResponse('FORBIDDEN', 'This request is not allowed.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const { valid, normalized, error } = validatePhone(body.phone);

    if (!valid) {
      return errorResponse('INVALID_PHONE', error || 'Invalid phone number format.', 400);
    }

    // 1. Send OTP via Fast2SMS provider
    const result = await sendOtp(normalized, getClientIp(req));
    if (!result.success) {
      if (result.status === 'cooldown') {
        const response = errorResponse('RATE_LIMIT_EXCEEDED', `Please wait ${result.retryAfterSeconds}s before requesting another OTP.`, 429);
        response.headers.set('Retry-After', String(result.retryAfterSeconds));
        return response;
      }
      if (result.status === 'rate_limited') {
        const response = errorResponse('RATE_LIMIT_EXCEEDED', `Too many OTP requests. Please try again in ${Math.ceil((result.retryAfterSeconds || 60) / 60)} minutes.`, 429);
        response.headers.set('Retry-After', String(result.retryAfterSeconds));
        return response;
      }
      if (result.status === 'provider_failed') {
        const providerMsg = typeof result.errorDetails === 'string' ? result.errorDetails : 'Unable to send OTP. Please check mobile number or try again.';
        return errorResponse('OTP_UNAVAILABLE', providerMsg, 503);
      }
    }

    // 2. Safe post-send customer lookup (failures here must not block a successfully sent OTP)
    let isCustomer = false;
    let existingName: string | null = null;

    try {
      const rawDigits = normalized.replace(/^\+91/, '').replace(/\D/g, '');
      const phoneVariants = Array.from(new Set([normalized, rawDigits, `+91${rawDigits}`]));

      const existingUser = await db.user.findFirst({
        where: { phone: { in: phoneVariants } },
        select: { id: true, name: true, role: true },
      });

      if (existingUser?.role === 'CUSTOMER') {
        isCustomer = true;
        const hasRealName =
          existingUser.name &&
          existingUser.name !== 'Customer' &&
          existingUser.name !== 'Valued Customer' &&
          existingUser.name !== 'Valued Member';
        if (hasRealName) {
          existingName = existingUser.name;
        }
      }
    } catch (dbErr: any) {
      console.warn('[SEND_OTP_DB_LOOKUP_WARNING] Non-fatal DB lookup warning:', dbErr.message);
    }

    return successResponse({
      message: 'If this number can receive SMS, an OTP will arrive shortly.',
      cooldownSeconds: result.cooldownSeconds,
      isExisting: isCustomer,
      existingName,
    });
  } catch (err: any) {
    console.error('[SEND_OTP_FATAL_ERROR]', err?.message || err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to send OTP.', 500);
  }
}
