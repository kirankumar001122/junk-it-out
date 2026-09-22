import { NextRequest, NextResponse } from 'next/server';
import { verifyOtp } from '@/lib/auth/otp';
import { validatePhone } from '@/lib/validations/schemas';
import { signToken } from '@/lib/auth/jwt';
import { db } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getClientIp, hasTrustedOrigin, addCorsHeaders } from '@/lib/auth/requestSecurity';

export async function OPTIONS(req: NextRequest) {
  const res = new NextResponse(null, { status: 204 });
  return addCorsHeaders(res, req);
}

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedOrigin(req)) {
      return addCorsHeaders(errorResponse('FORBIDDEN', 'This request is not allowed.', 403), req);
    }
    const body = await req.json().catch(() => ({}));
    const { valid: phoneValid, normalized, error: phoneError } = validatePhone(body.phone);

    if (!phoneValid) {
      return addCorsHeaders(errorResponse('INVALID_PHONE', phoneError || 'Invalid phone number.', 400), req);
    }

    if (!body.code || typeof body.code !== 'string') {
      return addCorsHeaders(errorResponse('INVALID_OTP', 'OTP code is required.', 400), req);
    }

    // 1. Verify OTP with Fast2SMS provider
    const otpVerification = await verifyOtp(normalized, body.code, getClientIp(req));
    if (!otpVerification.valid) {
      return addCorsHeaders(
        errorResponse(
          'OTP_VERIFICATION_FAILED',
          'The OTP could not be verified. Please request a new code and try again.',
          otpVerification.status === 'rate_limited' ? 429 : 400
        ),
        req
      );
    }

    // 2. Lookup & Provision Authorized Admin Account (7676272709 / 8884176048)
    const rawDigits = normalized.replace(/\D/g, '').slice(-10);
    const isAuthorizedAdminNumber = rawDigits === '7676272709' || rawDigits === '8884176048';
    const phoneVariants = Array.from(
      new Set([normalized, rawDigits, `+91${rawDigits}`, `0${rawDigits}`])
    );
    const adminEmail = `admin_${rawDigits}@junkitout.in`;

    let user = await db.user.findFirst({
      where: {
        OR: [
          { phone: { in: phoneVariants } },
          ...(isAuthorizedAdminNumber ? [{ email: adminEmail }] : []),
        ],
      },
      include: { admin: true, customer: true, agent: true },
    });

    if (isAuthorizedAdminNumber) {
      if (!user) {
        user = await db.user.create({
          data: {
            phone: `+91${rawDigits}`,
            email: adminEmail,
            name: 'Junk It Out Admin',
            role: 'SUPER_ADMIN',
            admin: {
              create: {
                department: 'Operations & Management',
                accessLevel: 'SUPER_ADMIN',
              },
            },
          },
          include: { admin: true, customer: true, agent: true },
        });
      } else {
        let adminRecord = user.admin || (await db.admin.findUnique({ where: { userId: user.id } }));
        if (!adminRecord) {
          adminRecord = await db.admin.upsert({
            where: { userId: user.id },
            update: { accessLevel: 'SUPER_ADMIN' },
            create: {
              userId: user.id,
              department: 'Operations & Management',
              accessLevel: 'SUPER_ADMIN',
            },
          });
        }

        user = await db.user.update({
          where: { id: user.id },
          data: {
            phone: user.phone || `+91${rawDigits}`,
            role: 'SUPER_ADMIN',
          },
          include: { admin: true, customer: true, agent: true },
        });

        if (!user.admin && adminRecord) {
          (user as any).admin = adminRecord;
        }
      }

      // Ensure unauthorized users do not retain ADMIN or SUPER_ADMIN access
      await db.user.updateMany({
        where: {
          role: { in: ['ADMIN', 'SUPER_ADMIN'] },
          phone: { notIn: ['+917676272709', '7676272709', '07676272709', '+918884176048', '8884176048', '08884176048'] },
        },
        data: { role: 'CUSTOMER' },
      });
    }

    const adminRecord = user?.admin || (user?.id ? await db.admin.findUnique({ where: { userId: user.id } }) : null);

    if (!user || !adminRecord || !['ADMIN', 'SUPER_ADMIN'].includes(user.role)) {
      return addCorsHeaders(
        errorResponse(
          'FORBIDDEN',
          'Admin access required. Access is strictly restricted to authorized administrative personnel.',
          403
        ),
        req
      );
    }

    // 3. Issue Signed JWT Token
    const token = signToken({
      userId: user.id,
      phone: user.phone,
      name: user.name,
      role: user.role as 'ADMIN' | 'SUPER_ADMIN',
      customerId: user.customer?.id ?? null,
      agentId: user.agent?.id ?? null,
      adminId: adminRecord.id,
    });

    const response = successResponse({
      message: 'Admin authentication successful.',
      user: {
        id: user.id,
        phone: user.phone,
        name: user.name,
        role: user.role,
        adminId: adminRecord.id,
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

    return addCorsHeaders(response, req);
  } catch (err: any) {
    console.error('Admin login error:', err);
    return addCorsHeaders(
      errorResponse('INTERNAL_SERVER_ERROR', err?.message || 'Admin authentication failed.', 500),
      req
    );
  }
}
