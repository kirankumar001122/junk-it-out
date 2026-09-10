import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const coupons = await db.coupon.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const formatted = coupons.map((c) => ({
      id: c.id,
      code: c.code,
      discountType: c.discountType,
      discountValue: c.discountValue,
      minOrderValue: c.minOrderValue,
      maxDiscount: c.maxDiscount || c.discountValue,
      active: c.active,
      expiryDate: c.expiryDate
        ? new Date(c.expiryDate).toISOString().split('T')[0]
        : '2026-12-31',
    }));

    return NextResponse.json({ success: true, data: formatted });
  } catch (error: any) {
    console.error('Fetch admin coupons error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    const { code, discountType, discountValue, minOrderValue, maxDiscount, expiryDate } = body;

    if (!code || discountValue === undefined) {
      return NextResponse.json({ success: false, message: 'Code and discount value required.' }, { status: 400 });
    }

    const created = await db.coupon.create({
      data: {
        code: code.toUpperCase().trim(),
        discountType: discountType || 'FLAT',
        discountValue: parseFloat(discountValue),
        minOrderValue: minOrderValue ? parseFloat(minOrderValue) : 100.0,
        maxDiscount: maxDiscount ? parseFloat(maxDiscount) : 100.0,
        active: true,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
    });

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    console.error('Create coupon error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json();
    const { id, active } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Coupon ID required.' }, { status: 400 });
    }

    const updated = await db.coupon.update({
      where: { id },
      data: { active: Boolean(active) },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update coupon error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
