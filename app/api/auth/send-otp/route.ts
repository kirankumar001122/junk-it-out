import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawPhone = body.phone || body.phoneNumber || '';
    const phone = String(rawPhone).replace(/\D/g, '').slice(-10);

    // Uniform response shape for SEC-08 - never disclose existence
    // Always 200 with same shape, even if phone is invalid, so attacker
    // can't enumerate customers by status code / response shape
    const data = {
      message: 'If this number is registered, an OTP has been sent.',
      cooldownSeconds: 30,
    };

    if (!phone || phone.length !== 10) {
      // Still return same shape, but 400 for client validation
      // Do NOT add isExisting / existingName / otp here
      return NextResponse.json({ success: true, data }, { status: 200 });
    }

    // NOTE: Do NOT return otp, isExisting, existingName here.
    // Real OTP sending should happen via lib/auth/otp in background.
    // For now, keep uniform response - no DB lookup result leaked.
    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch {
    return NextResponse.json(
      {
        success: true,
        data: {
          message: 'If this number is registered, an OTP has been sent.',
          cooldownSeconds: 30,
        },
      },
      { status: 200 }
    );
  }
}