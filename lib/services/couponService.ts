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
  isDbError?: boolean;
};

/**
 * Validate coupon code and calculate discount amount server-side.
 * Never trust a discount amount supplied only by the client.
 * Strictly checks the database; no hardcoded fallbacks that could bypass deactivated/deleted state.
 */
export async function validateAndCalculateCoupon(
  rawCode: string | null | undefined,
  subtotal: number,
  customerId?: string | null,
  prefetchedCoupon?: any
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

  // 1. Look up in database (or reuse prefetched coupon when resolved in parallel pre-flight)
  let coupon: any = prefetchedCoupon;
  if (coupon === undefined) {
    try {
      coupon = await db.coupon.findUnique({
        where: { code },
      });
    } catch (err: any) {
      console.error('[COUPON] Database lookup error:', err);
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
        error: 'Database error occurred while looking up coupon.',
        isDbError: true,
      };
    }
  }

  // 2. Existence check (no hardcoded fallback)
  if (!coupon) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Coupon code "${code}" is invalid.`,
    };
  }

  // 3. Active status check
  if (!coupon.active) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Coupon code "${code}" is no longer active.`,
    };
  }

  // 4. Expiry date check
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

  // 5. Minimum order value requirement
  const minOrder = Number(coupon.minOrderValue) || 0;
  if (minOrder > 0 && safeSubtotal < minOrder) {
    return {
      valid: false,
      discountAmount: 0,
      finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
      error: `Minimum order value of ₹${minOrder.toFixed(0)} required to apply "${code}". Current order is ₹${safeSubtotal.toFixed(2)}.`,
    };
  }

  // 6. Customer eligibility check (WELCOME50 is only for first pickup order)
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
    } catch (err: any) {
      console.error('[COUPON] Prior orders count check error:', err);
      return {
        valid: false,
        discountAmount: 0,
        finalAmount: Math.max(1, Math.round(safeSubtotal * 100) / 100),
        error: 'Database error occurred while verifying coupon eligibility.',
        isDbError: true,
      };
    }
  }

  // 7. Discount calculation
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
