import { NextRequest } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import {
  CustomerRoleConflictError,
  findOrCreateUserCustomer,
} from '@/lib/services/customerService';
import { signToken } from '@/lib/auth/jwt';
import {
  successResponse,
  errorResponse,
} from '@/lib/utils/apiResponse';
import {
  getClientIp,
  hasTrustedOrigin,
} from '@/lib/auth/requestSecurity';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    // Security check
    if (!hasTrustedOrigin(req)) {
      return errorResponse(
        'FORBIDDEN',
        'This request is not allowed.',
        403
      );
    }

    const body = await req.json().catch(() => ({}));

    // Validate phone
    const {
      valid: phoneValid,
      normalized,
      error: phoneError,
    } = validatePhone(body.phone);

    if (!phoneValid) {
      return errorResponse(
        'INVALID_PHONE',
        phoneError || 'Invalid phone number.',
        400
      );
    }

    // Validate OTP exists
    if (!body.code || typeof body.code !== 'string') {
      return errorResponse(
        'INVALID_OTP',
        'OTP code is required.',
        400
      );
    }

    const cleanCode = String(body.code).trim();

    /*
     * ---------------------------------------------------------
     * TEST OTP MODE
     * ---------------------------------------------------------
     * Only the configured test phone can bypass Fast2SMS.
     *
     * .env:
     * OTP_TEST_MODE=true
     * OTP_TEST_PHONE=9876543210
     *
     * Any 6-digit OTP will work for this number.
     * All other numbers continue through Fast2SMS.
     * ---------------------------------------------------------
     */

    const testModeEnabled =
      process.env.OTP_TEST_MODE?.trim().toLowerCase() === 'true';

    const configuredTestPhone =
      process.env.OTP_TEST_PHONE?.replace(/\D/g, '') || '';

    const normalizedUserPhone =
      normalized.replace(/\D/g, '').slice(-10);

    const normalizedTestPhone =
      configuredTestPhone.slice(-10);

    const isTestPhone =
      testModeEnabled &&
      normalizedTestPhone.length === 10 &&
      normalizedUserPhone.length === 10 &&
      normalizedTestPhone === normalizedUserPhone;

    /*
     * Verify OTP
     */
    if (isTestPhone) {
      // Test number: accept any 6-digit OTP
      if (!/^\d{6}$/.test(cleanCode)) {
        return errorResponse(
          'INVALID_OTP',
          'Please enter a valid 6-digit OTP.',
          400
        );
      }

      console.log(
        `[OTP_TEST_MODE] Test OTP accepted for configured test number.`
      );
    } else {
      // All other numbers: normal Fast2SMS OTP verification
      const otpVerification = await verifyOtp(
        normalized,
        cleanCode,
        getClientIp(req)
      );

      if (!otpVerification.valid) {
        const status =
          otpVerification.status === 'rate_limited'
            ? 429
            : 400;

        const msg =
          typeof (otpVerification as any).errorDetails === 'string' &&
          (otpVerification as any).errorDetails
            ? (otpVerification as any).errorDetails
            : 'The OTP could not be verified. Please request a new code and try again.';

        return errorResponse(
          'OTP_VERIFICATION_FAILED',
          msg,
          status
        );
      }
    }

    // ---------------------------------------------------------
    // Find or create customer
    // ---------------------------------------------------------

    const existingUser = await db.user.findUnique({
      where: {
        phone: normalized,
      },
      select: {
        id: true,
        name: true,
        role: true,
      },
    });

    const providedName =
      typeof body.name === 'string'
        ? body.name.trim()
        : '';

    const hasExistingRealName =
      existingUser?.role === 'CUSTOMER' &&
      existingUser.name &&
      existingUser.name !== 'Customer' &&
      existingUser.name !== 'Valued Customer' &&
      existingUser.name !== 'Valued Member';

    let userName: string;

    if (hasExistingRealName) {
      userName = existingUser!.name!;
    } else if (
      providedName &&
      providedName.length >= 2
    ) {
      userName = providedName;
    } else {
      userName = 'Customer';
    }

    const user = await findOrCreateUserCustomer(
      normalized,
      userName
    );

    // ---------------------------------------------------------
    // Create JWT
    // ---------------------------------------------------------

    const token = signToken({
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: 'CUSTOMER',
      customerId: user.customer?.id,
      agentId: null,
      adminId: null,
    });

    // ---------------------------------------------------------
    // Response
    // ---------------------------------------------------------

    const response = successResponse({
      message: 'Authentication successful.',
      testMode: isTestPhone,

      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        customerId: user.customer?.id,
      },
    });

    // HTTP-only authentication cookie
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
    if (err instanceof CustomerRoleConflictError) {
      return errorResponse(
        'FORBIDDEN',
        'This number is not available for customer sign-in.',
        403
      );
    }

    console.error(
      'Verify OTP error:',
      err?.message || err
    );

    return errorResponse(
      'INTERNAL_SERVER_ERROR',
      'Authentication failed.',
      500
    );
  }
}