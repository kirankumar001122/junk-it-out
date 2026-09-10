import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import { CustomerRoleConflictError, findOrCreateUserCustomer } from '@/lib/services/customerService';
import { signToken } from '@/lib/auth/jwt';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getClientIp, hasTrustedOrigin } from '@/lib/auth/requestSecurity';
import { db } from '@/lib/db';

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

    const cleanCode = String(body.code).trim();
    const otpVerification = await verifyOtp(normalized, cleanCode, getClientIp(req));
    if (!otpVerification.valid) {
      const status = otpVerification.status === 'rate_limited' ? 429 : 400;
      const msg =
        typeof (otpVerification as any).errorDetails === 'string' && (otpVerification as any).errorDetails
          ? (otpVerification as any).errorDetails
          : 'The OTP could not be verified. Please request a new code and try again.';
      return errorResponse('OTP_VERIFICATION_FAILED', msg, status);
    }

    // Find or create customer record
    // For new customers, use the provided name. For existing customers, keep their existing name.
    const existingUser = await db.user.findUnique({
      where: { phone: normalized },
      select: { id: true, name: true, role: true },
    });

    const providedName = typeof body.name === 'string' ? body.name.trim() : '';
    const hasExistingRealName =
      existingUser?.role === 'CUSTOMER' &&
      existingUser.name &&
      existingUser.name !== 'Customer' &&
      existingUser.name !== 'Valued Customer' &&
      existingUser.name !== 'Valued Member';

    let userName: string;
    if (hasExistingRealName) {
      userName = existingUser!.name!;
    } else if (providedName && providedName.length >= 2) {
      userName = providedName;
    } else {
      userName = 'Customer';
    }

    const user = await findOrCreateUserCustomer(normalized, userName);

    const token = signToken({
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: 'CUSTOMER',
      customerId: user.customer?.id,
      agentId: null,
      adminId: null,
    });

    const response = successResponse({
      message: 'Authentication successful.',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        customerId: user.customer?.id,
      },
    });

    // Set secure HTTP-only cookie
    response.cookies.set({
      name: 'jio_token',
      value: token,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return response;
  } catch (err: any) {
    if (err instanceof CustomerRoleConflictError) {
      return errorResponse('FORBIDDEN', 'This number is not available for customer sign-in.', 403);
    }
    console.error('Verify OTP error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Authentication failed.', 500);
  }
}
