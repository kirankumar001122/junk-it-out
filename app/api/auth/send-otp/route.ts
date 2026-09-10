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
      return errorResponse('INVALID_PHONE', error || 'Invalid phone number.', 400);
    }

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

    const existingUser = await db.user.findUnique({
      where: { phone: normalized },
      select: { id: true, name: true, role: true },
    });

    const isCustomer = existingUser?.role === 'CUSTOMER';
    const hasRealName = isCustomer && existingUser?.name && existingUser.name !== 'Customer' && existingUser.name !== 'Valued Customer' && existingUser.name !== 'Valued Member';

    return successResponse({
      message: 'If this number can receive SMS, an OTP will arrive shortly.',
      cooldownSeconds: result.cooldownSeconds,
      isExisting: isCustomer,
      existingName: hasRealName ? existingUser.name : null,
    });
  } catch (err: any) {
    console.error('Send OTP error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to send OTP.', 500);
  }
}
