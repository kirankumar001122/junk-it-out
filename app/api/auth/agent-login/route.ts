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
      return errorResponse('FORBIDDEN', 'This request is not allowed from cross-origin.', 403);
    }
    const body = await req.json().catch(() => ({}));
    const { valid: phoneValid, normalized, error: phoneError } = validatePhone(body.phone);

    if (!phoneValid) {
      return errorResponse('INVALID_PHONE', phoneError || 'Invalid phone number format.', 400);
    }

    if (!body.code || typeof body.code !== 'string' || body.code.trim().length === 0) {
      return errorResponse('INVALID_OTP', 'OTP verification code is required.', 400);
    }

    // 1. Verify OTP with Fast2SMS provider
    const otpVerification = await verifyOtp(normalized, body.code, getClientIp(req));
    if (!otpVerification.valid) {
      const providerMsg =
        typeof (otpVerification as any).errorDetails === 'string' && (otpVerification as any).errorDetails
          ? (otpVerification as any).errorDetails
          : 'The OTP entered is invalid or has expired. Please request a new code and try again.';

      return errorResponse(
        'OTP_VERIFICATION_FAILED',
        providerMsg,
        otpVerification.status === 'rate_limited' ? 429 : 400
      );
    }

    // 2. Lookup Agent User in Database (with phone format resilience)
    const rawDigits = normalized.replace(/^\+91/, '').replace(/\D/g, '');
    const phoneVariants = Array.from(
      new Set([normalized, rawDigits, `+91${rawDigits}`, `0${rawDigits}`])
    );

    const user = await db.user.findFirst({
      where: { phone: { in: phoneVariants } },
      include: { agent: true },
    });

    if (!user) {
      return errorResponse(
        'NOT_FOUND',
        `No registered agent account found for ${normalized}. Please contact operations to register as a field agent.`,
        404
      );
    }

    if (user.role !== 'AGENT' || !user.agent) {
      return errorResponse(
        'FORBIDDEN',
        `Account ${normalized} is registered as ${user.role}. Agent Portal access is restricted to authorized field agents.`,
        403
      );
    }

    // 3. Generate Signed JWT Session Token
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

    // 4. Set Secure HTTP-Only Cookie
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
  } catch (err: any) {
    console.error('Agent login error:', err);
    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      err?.message || 'Agent authentication failed.',
      500
    );
  }
}
