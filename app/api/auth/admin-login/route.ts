import { NextRequest } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import { signToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getClientIp, hasTrustedOrigin } from '@/lib/auth/requestSecurity';

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedOrigin(req)) {
      return errorResponse('FORBIDDEN', 'This request is not allowed.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const { valid: phoneValid, normalized, error: phoneError } = validatePhone(body.phone);

    if (!phoneValid) {
      return errorResponse('INVALID_PHONE', phoneError || 'Invalid phone number.', 400);
    }

    if (!body.code || typeof body.code !== 'string') {
      return errorResponse('INVALID_OTP', 'OTP code is required.', 400);
    }

    const otpVerification = await verifyOtp(normalized, body.code, getClientIp(req));
    if (!otpVerification.valid) {
      return errorResponse('OTP_VERIFICATION_FAILED', 'The OTP could not be verified. Please request a new code and try again.', otpVerification.status === 'rate_limited' ? 429 : 400);
    }

    const user = await db.user.findUnique({
      where: { phone: normalized },
      include: { admin: true, customer: true, agent: true },
    });

    if (!user || !user.admin || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return errorResponse(
        'FORBIDDEN',
        'Admin access required. This portal is restricted to authorized operations staff.',
        403
      );
    }

    const token = signToken({
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role as 'ADMIN' | 'SUPER_ADMIN',
      customerId: user.customer?.id ?? null,
      agentId: user.agent?.id ?? null,
      adminId: user.admin.id,
    });

    const response = successResponse({
      message: 'Admin authentication successful.',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        adminId: user.admin.id,
      },
    });

    response.cookies.set({
      name: 'jio_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60,
    });

    return response;
  } catch (err: unknown) {
    console.error('Admin login error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Admin authentication failed.', 500);
  }
}
