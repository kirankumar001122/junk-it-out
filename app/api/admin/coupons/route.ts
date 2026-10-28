import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, Number(searchParams.get('page') || 1) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize') || 25) || 25));
    const coupons = await db.coupon.findMany({
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
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

    return NextResponse.json({ success: true, data: formatted, page, pageSize });
  } catch (error: any) {
    console.error('Fetch admin coupons error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { code, discountType, discountValue, minOrderValue, maxDiscount, expiryDate } = body;

    if (!code || typeof code !== 'string' || !code.trim()) {
      return NextResponse.json({ success: false, message: 'Coupon code is required.' }, { status: 400 });
    }

    const cleanCode = code.toUpperCase().trim();
    if (cleanCode.length < 3 || cleanCode.length > 20) {
      return NextResponse.json({ success: false, message: 'Coupon code must be between 3 and 20 characters.' }, { status: 400 });
    }

    const numDiscount = Number(discountValue);
    if (!Number.isFinite(numDiscount) || numDiscount <= 0) {
      return NextResponse.json({ success: false, message: 'Discount value must be a positive number greater than 0.' }, { status: 400 });
    }

    const validDiscountType = discountType === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT';
    if (validDiscountType === 'PERCENTAGE' && numDiscount > 100) {
      return NextResponse.json({ success: false, message: 'Percentage discount cannot exceed 100%.' }, { status: 400 });
    }

    const numMinOrder = minOrderValue !== undefined && minOrderValue !== '' ? Math.max(0, Number(minOrderValue) || 0) : 100.0;
    const numMaxDiscount = maxDiscount !== undefined && maxDiscount !== '' ? Math.max(0, Number(maxDiscount) || 0) : numDiscount;

    let parsedExpiry: Date | null = null;
    if (expiryDate) {
      const exp = new Date(expiryDate);
      if (!isNaN(exp.getTime())) {
        parsedExpiry = exp;
      }
    }

    const created = await db.coupon.create({
      data: {
        code: cleanCode,
        discountType: validDiscountType,
        discountValue: numDiscount,
        minOrderValue: numMinOrder,
        maxDiscount: numMaxDiscount,
        active: true,
        expiryDate: parsedExpiry,
      },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'COUPON_CREATED',
        oldValue: null,
        newValue: `Created coupon ${created.code}: ${created.discountType} ₹${created.discountValue}`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, data: created });
  } catch (error: any) {
    console.error('Create coupon error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return NextResponse.json({ success: false, message: 'Authentication is required.' }, { status: 401 });
    }
    if (authorizationStatus === 403) {
      return NextResponse.json({ success: false, message: 'Admin access required.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { id, active } = body;

    if (!id || typeof id !== 'string') {
      return NextResponse.json({ success: false, message: 'Valid coupon ID required.' }, { status: 400 });
    }

    const existing = await db.coupon.findUnique({ where: { id: id.trim() } });
    if (!existing) {
      return NextResponse.json({ success: false, message: 'Coupon not found.' }, { status: 404 });
    }

    const updated = await db.coupon.update({
      where: { id: id.trim() },
      data: { active: Boolean(active) },
    });

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'COUPON_STATUS_UPDATED',
        oldValue: `Active: ${existing.active}`,
        newValue: `Active: ${updated.active}`,
      },
    }).catch(() => null);

    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update coupon error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
