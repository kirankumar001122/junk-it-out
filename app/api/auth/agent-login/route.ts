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
      return errorResponse(
        'OTP_VERIFICATION_FAILED',
        'The OTP could not be verified. Please request a new code and try again.',
        otpVerification.status === 'rate_limited' ? 429 : 400
      );
    }

    const user = await db.user.findUnique({
      where: { phone: normalized },
      include: { agent: true },
    });

    if (!user || user.role !== 'AGENT' || !user.agent) {
      return errorResponse(
        'FORBIDDEN',
        'Agent access required. This portal is restricted to registered Junk It Out pickup agents.',
        403
      );
    }

    const token = signToken({
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: 'AGENT',
      customerId: null,
      agentId: user.agent.id,
      adminId: null,
    });

    const response = successResponse({
      message: 'Agent authentication successful.',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        agentId: user.agent.id,
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
    console.error('Agent login error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Agent authentication failed.', 500);
  }
}
