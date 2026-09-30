import { NextRequest, NextResponse } from 'next/server';

import { sendOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  getClientIp,
  hasTrustedOrigin,
  addCorsHeaders,
} from '@/lib/auth/requestSecurity';
import { db } from '@/lib/db';

export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return addCorsHeaders(res, req);
}

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedOrigin(req)) {
      return addCorsHeaders(
        errorResponse('FORBIDDEN', 'This request is not allowed.', 403),
        req
      );
    }

    const body = await req.json().catch(() => ({}));

    const { valid, normalized, error } = validatePhone(body.phone);

    if (!valid) {
      return addCorsHeaders(
        errorResponse(
          'INVALID_PHONE',
          error || 'Invalid phone number format.',
          400
        ),
        req
      );
    }

    /*
     * ------------------------------------------------------------
     * LOCAL TEST OTP MODE
     * ------------------------------------------------------------
     *
     * Enable only in your local .env:
     *
     * OTP_TEST_MODE=true
     * OTP_TEST_PHONE=9876543210
     *
     * The configured test number skips Fast2SMS.
     * The verify-otp route will handle the test OTP.
     *
     * IMPORTANT:
     * OTP_TEST_MODE should be false in production.
     * ------------------------------------------------------------
     */

    const testModeEnabled =
      process.env.OTP_TEST_MODE?.trim().toLowerCase() === 'true';

    const configuredTestPhone =
      process.env.OTP_TEST_PHONE?.replace(/\D/g, '') || '';

    const normalizedDigits = normalized.replace(/\D/g, '');

    // Compare only the final 10 digits so +91XXXXXXXXXX,
    // 91XXXXXXXXXX and XXXXXXXXXX work consistently.
    const normalizedTestPhone = configuredTestPhone.slice(-10);
    const normalizedUserPhone = normalizedDigits.slice(-10);

    const isTestPhone =
      testModeEnabled &&
      normalizedTestPhone.length === 10 &&
      normalizedUserPhone.length === 10 &&
      normalizedTestPhone === normalizedUserPhone;

    let cooldownSeconds = 30;

    /*
     * TEST NUMBER:
     * Do not call Fast2SMS.
     *
     * Example:
     * OTP_TEST_PHONE=9876543210
     *
     * User enters 9876543210
     *       ↓
     * Fast2SMS is skipped
     *       ↓
     * Verify route accepts any 6-digit OTP
     */
    if (isTestPhone) {
      console.log(
        `[OTP_TEST_MODE] Test OTP login requested for configured test number.`
      );

      cooldownSeconds = 0;
    } else {
      /*
       * ------------------------------------------------------------
       * NORMAL CUSTOMER OTP
       * ------------------------------------------------------------
       *
       * All numbers except the configured test number continue
       * through the real Fast2SMS OTP provider.
       */
      const result = await sendOtp(normalized, getClientIp(req));

      if (!result.success) {
        if (result.status === 'cooldown') {
          const response = errorResponse(
            'RATE_LIMIT_EXCEEDED',
            `Please wait ${result.retryAfterSeconds}s before requesting another OTP.`,
            429
          );

          response.headers.set(
            'Retry-After',
            String(result.retryAfterSeconds)
          );

          return addCorsHeaders(response, req);
        }

        if (result.status === 'rate_limited') {
          const response = errorResponse(
            'RATE_LIMIT_EXCEEDED',
            `Too many OTP requests. Please try again in ${Math.ceil(
              (result.retryAfterSeconds || 60) / 60
            )} minutes.`,
            429
          );

          response.headers.set(
            'Retry-After',
            String(result.retryAfterSeconds)
          );

          return addCorsHeaders(response, req);
        }

        if (result.status === 'provider_failed') {
          const providerMsg =
            typeof result.errorDetails === 'string'
              ? result.errorDetails
              : 'Unable to send OTP. Please check mobile number or try again.';

          return addCorsHeaders(
            errorResponse('OTP_UNAVAILABLE', providerMsg, 503),
            req
          );
        }

        return addCorsHeaders(
          errorResponse(
            'OTP_UNAVAILABLE',
            'Unable to send OTP. Please try again.',
            503
          ),
          req
        );
      }

      cooldownSeconds = Number(result.cooldownSeconds) || 30;
    }

    /*
     * ------------------------------------------------------------
     * CUSTOMER LOOKUP
     * ------------------------------------------------------------
     *
     * This remains the same for both test and real OTP flows.
     * It allows the frontend to keep the existing customer name.
     */
    let isCustomer = false;
    let existingName: string | null = null;

    try {
      const rawDigits = normalized.replace(/\D/g, '');

      const phoneVariants = Array.from(
        new Set([
          normalized,
          rawDigits,
          `+91${rawDigits.slice(-10)}`,
        ])
      );

      const existingUser = await db.user.findFirst({
        where: {
          phone: {
            in: phoneVariants,
          },
        },
        select: {
          id: true,
          name: true,
          role: true,
        },
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
      /*
       * Customer lookup is intentionally non-fatal.
       * A successfully requested OTP should not fail just because
       * the optional customer-name lookup had a DB issue.
       */
      console.warn(
        '[SEND_OTP_DB_LOOKUP_WARNING] Non-fatal DB lookup warning:',
        dbErr?.message || dbErr
      );
    }

    return addCorsHeaders(
      successResponse({
        message: isTestPhone
          ? 'Test OTP mode enabled. Enter any 6-digit OTP.'
          : 'If this number can receive SMS, an OTP will arrive shortly.',
        cooldownSeconds,
        isExisting: isCustomer,
        existingName,

        // This is intentionally only true for the configured test
        // number while local test mode is enabled.
        testMode: isTestPhone,
      }),
      req
    );
  } catch (err: any) {
    console.error(
      '[SEND_OTP_FATAL_ERROR]',
      err?.message || err
    );

    return addCorsHeaders(
      errorResponse(
        'INTERNAL_SERVER_ERROR',
        'Failed to send OTP.',
        500
      ),
      req
    );
  }
}