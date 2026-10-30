import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth/middleware';
import { validateAndCalculateCoupon } from '@/lib/services/couponService';

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, message: 'Invalid request body.' },
        { status: 400 }
      );
    }

    const { code, subtotal } = body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json(
        { success: false, message: 'Coupon code is required.' },
        { status: 400 }
      );
    }

    const numericSubtotal = Number(subtotal);
    if (!Number.isFinite(numericSubtotal) || numericSubtotal <= 0) {
      return NextResponse.json(
        { success: false, message: 'A valid order subtotal is required to apply a coupon.' },
        { status: 400 }
      );
    }

    const result = await validateAndCalculateCoupon(
      code,
      numericSubtotal,
      authUser?.customerId || null
    );

    if (!result.valid) {
      if (result.isDbError) {
        return NextResponse.json(
          { success: false, message: result.error || 'Database error occurred while verifying coupon.' },
          { status: 503 }
        );
      }
      return NextResponse.json(
        { success: false, message: result.error || 'Invalid or ineligible coupon code.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (err: any) {
    console.error('Coupon validation error:', err);
    return NextResponse.json(
      { success: false, message: 'Internal server error validating coupon.' },
      { status: 500 }
    );
  }
}
