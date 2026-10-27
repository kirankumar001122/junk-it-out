import { db } from '@/lib/db';

export class InvalidCouponError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidCouponError';
  }
}

export type CouponValidationResult = {
  valid: boolean;
  code?: string;
  discountType?: string;
  discountValue?: number;
  discountAmount: number;
  finalAmount: number;
  minOrderValue?: number;
  message?: string;
  error?: string;
};

// Known coupon definitions (used as fallbacks if database table has not been seeded)
const KNOWN_COUPONS: Record<string, {
  code: string;
  discountType: 'FLAT' | 'PERCENTAGE';
  discountValue: number;
  minOrderValue: number;
  maxDiscount?: number;
  active: boolean;
}> = {
  WELCOME50: {
    code: 'WELCOME50',
    discountType: 'FLAT',
    discountValue: 50.0,
    minOrderValue: 100.0,
    maxDiscount: 100.0,
    active: true,
  },
  SOUTHBLR20: {
    code: 'SOUTHBLR20',
    discountType: 'PERCENTAGE',
    discountValue: 20.0,
    minOrderValue: 200.0,
    maxDiscount: 100.0,
    active: true,
  },
};

/**
 * Validate coupon code and calculate discount amount server-side.
 * Never trust a discount amount supplied only by the client.
 */
export async function validateAndCalculateCoupon(
  rawCode: string | null | undefined,
  subtotal: number,
  customerId?: string | null
): Promise<CouponValidationResult> {
  const safeSubtotal = Math.max(0, Number(subtotal) || 0);

  if (!rawCode || typeof rawCode !== 'string' || !rawCode.trim()) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: 'Coupon code is required.',
    };
  }

  const code = rawCode.trim().toUpperCase();

  // 1. Look up in database
  let coupon: any = null;
  try {
    coupon = await db.coupon.findUnique({
      where: { code },
    });
  } catch (err) {
    console.warn('[COUPON] Database lookup error, checking known coupons fallback:', err);
  }

  // 2. Fallback to known seeded coupons if database record not found
  if (!coupon && KNOWN_COUPONS[code]) {
    coupon = KNOWN_COUPONS[code];
  }

  // 3. Existence check
  if (!coupon) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Coupon code "${code}" is invalid.`,
    };
  }

  // 4. Active status check
  if (!coupon.active) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Coupon code "${code}" is no longer active.`,
    };
  }

  // 5. Expiry date check
  if (coupon.expiryDate) {
    const expiry = new Date(coupon.expiryDate);
    if (!isNaN(expiry.getTime()) && expiry.getTime() < Date.now()) {
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
        error: `Coupon "${code}" has expired.`,
      };
    }
  }

  // 6. Minimum order value requirement
  const minOrder = Number(coupon.minOrderValue) || 0;
  if (minOrder > 0 && safeSubtotal < minOrder) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Minimum order value of ₹${minOrder.toFixed(0)} required to apply "${code}". Current order is ₹${safeSubtotal.toFixed(2)}.`,
    };
  }

  // 7. Customer eligibility check (WELCOME50 is only for first pickup order)
  if (code === 'WELCOME50' && customerId) {
    try {
      const priorOrdersCount = await db.order.count({
        where: {
          customerId,
          status: { not: 'CANCELLED' },
          paymentStatus: { in: ['CAPTURED', 'SUCCESS'] },
        },
      });

      if (priorOrdersCount > 0) {
        return {
          valid: false,
          discountAmount: 0,
          finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
          error: 'Coupon WELCOME50 is only valid for your first pickup booking.',
        };
      }
    } catch (err) {
      console.warn('[COUPON] Prior orders count check skipped:', err);
    }
  }

  // 8. Discount calculation
  let discount = 0;
  if (coupon.discountType === 'FLAT') {
    discount = Number(coupon.discountValue) || 0;
  } else if (coupon.discountType === 'PERCENTAGE') {
    const pct = Number(coupon.discountValue) || 0;
    discount = safeSubtotal * (pct / 100);
    if (coupon.maxDiscount && Number(coupon.maxDiscount) > 0) {
      discount = Math.min(discount, Number(coupon.maxDiscount));
    }
  }

  // Ensure minimum payable amount is ₹1.00 (discount cannot exceed subtotal - 1)
  discount = Math.min(discount, Math.max(0, safeSubtotal - 1));
  discount = Math.round(discount * 100) / 100;

  const finalAmount = Math.max(1, Math.round((safeSubtotal - discount) * 100) / 100);

  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue,
    discountAmount: discount,
    finalAmount,
    minOrderValue: minOrder,
    message: `Coupon ${coupon.code} applied! Saved ₹${discount.toFixed(2)}.`,
  };
}
