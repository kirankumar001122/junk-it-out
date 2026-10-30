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

    // 2. Lookup & Provision Agent User (Authorized Agent: 9353276638)
    const rawDigits = normalized.replace(/\D/g, '').slice(-10);
    const isAuthorizedAgentNumber = rawDigits === '9353276638';
    const phoneVariants = Array.from(
      new Set([normalized, rawDigits, `+91${rawDigits}`, `0${rawDigits}`])
    );

    let user = await db.user.findFirst({
      where: { phone: { in: phoneVariants } },
      include: { agent: true },
    });

    if (isAuthorizedAgentNumber) {
      if (!user) {
        // Create official agent user
        user = await db.user.create({
          data: {
            phone: `+91${rawDigits}`,
            email: 'agent@junkitout.in',
            name: 'Junk It Out Agent',
            role: 'AGENT',
            agent: {
              create: {
                vehicleType: 'Piaggio Ape Auto Loader (KA-05-JK-1024)',
                vehicleNumber: 'KA-05-JK-1024',
                status: 'AVAILABLE',
                serviceAreas: 'JP Nagar, Jayanagar, Koramangala, Electronic City',
              },
            },
          },
          include: { agent: true },
        });
      } else {
        // Ensure user has AGENT role & active agent profile
        if (user.role !== 'AGENT' || !user.agent) {
          let agentRecord = user.agent;
          if (!agentRecord) {
            agentRecord = await db.agent.create({
              data: {
                userId: user.id,
                vehicleType: 'Piaggio Ape Auto Loader (KA-05-JK-1024)',
                vehicleNumber: 'KA-05-JK-1024',
                status: 'AVAILABLE',
                serviceAreas: 'JP Nagar, Jayanagar, Koramangala, Electronic City',
              },
            });
          }
          user = await db.user.update({
            where: { id: user.id },
            data: { role: 'AGENT' },
            include: { agent: true },
          });
        }
      }

      // Reassign any active unassigned/legacy agent orders to this agent
      if (user?.agent?.id) {
        await db.order.updateMany({
          where: {
            status: { in: ['BOOKING_RECEIVED', 'AGENT_BEING_ASSIGNED', 'AGENT_ASSIGNED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WEIGHING'] },
            agentId: null,
          },
          data: { agentId: user.agent.id, status: 'AGENT_ASSIGNED' },
        });
      }
    }

    if (!user || user.role !== 'AGENT' || !user.agent) {
      return errorResponse(
        'FORBIDDEN',
        `No registered agent account found for ${normalized}. Agent Portal access is restricted to authorized field agent (9353276638).`,
        403
      );
    }

    if (user.agent.status === 'OFFLINE' || user.agent.status === 'SUSPENDED' || user.agent.status === 'DEACTIVATED') {
      return errorResponse(
        'FORBIDDEN',
        'Agent account is inactive. Please contact the administrator.',
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
      tokenVersion: (user.agent as any).tokenVersion || 1,
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
