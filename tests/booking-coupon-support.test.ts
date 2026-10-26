import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_key_coupon';

const state = {
  payment: null as any,
  gatewayCalls: 0,
  lastRazorpayOrderParams: null as any,
  currentUser: {
    userId: 'customer-user-1',
    customerId: 'customer-1',
    phone: '9876543210',
    role: 'CUSTOMER',
  } as any,
  customerPriorOrdersCount: 0,
  dbCoupons: {} as Record<string, any>,
};

const baseOrder = {
  id: 'order-coupon-1',
  customerId: 'customer-1',
  financialDirection: 'CUSTOMER_PAYS',
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'INITIATED',
  estimatedTotal: 100,
  pickupCharge: 69,
  discountAmount: 50,
  finalAmount: 119,
  orderNumber: 'JIO-CPN-001',
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  address: { area: 'JP Nagar' },
  items: [{ estimatedWeight: 5 }],
};

let currentOrder = { ...baseOrder };

vi.mock('@/lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => state.currentUser),
}));

vi.mock('@/lib/payments/razorpay', () => ({
  createRazorpayOrder: vi.fn(async (params: any) => {
    state.gatewayCalls += 1;
    state.lastRazorpayOrderParams = params;
    return {
      id: `order_rzp_${state.gatewayCalls}`,
      amount: params.amountInPaise,
      currency: 'INR',
      keyId: 'rzp_test_key_coupon',
    };
  }),
  fetchRazorpayPayment: vi.fn(async () => ({
    id: 'pay_coupon_1',
    order_id: 'order_rzp_1',
    amount: 11900,
    currency: 'INR',
    status: 'captured',
  })),
  verifyRazorpayPaymentSignature: vi.fn(() => true),
  verifyRazorpayWebhookSignature: vi.fn(() => true),
  RazorpayOrderCreationError: class extends Error {
    uncertain = false;
  },
}));

vi.mock('@/lib/db', () => {
  const coupon = {
    findUnique: vi.fn(async ({ where }: any) => {
      const code = where.code?.toUpperCase();
      if (state.dbCoupons[code]) {
        return { ...state.dbCoupons[code] };
      }
      return null;
    }),
  };

  const orderTable = {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id === currentOrder.id) {
        return {
          ...currentOrder,
          payments: state.payment ? [{ ...state.payment }] : [],
        };
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      if (where.id === currentOrder.id) {
        return { ...currentOrder };
      }
      return null;
    }),
    count: vi.fn(async ({ where }: any) => {
      if (where.customerId === 'customer-1') {
        return state.customerPriorOrdersCount;
      }
      return 0;
    }),
    create: vi.fn(async ({ data }: any) => {
      currentOrder = {
        id: `order-${Date.now()}`,
        ...data,
      };
      return { ...currentOrder };
    }),
    update: vi.fn(async ({ data }: any) => {
      currentOrder = { ...currentOrder, ...data };
      return { ...currentOrder };
    }),
  };

  const payment = {
    findFirst: vi.fn(async ({ where }: any) => {
      if (!state.payment) return null;
      if (where.status?.in && !where.status.in.includes(state.payment.status)) {
        return null;
      }
      return { ...state.payment, order: { ...currentOrder } };
    }),
    findUnique: vi.fn(async () => (state.payment ? { ...state.payment } : null)),
    create: vi.fn(async ({ data }: any) => {
      state.payment = {
        id: 'payment-coupon-id',
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return { ...state.payment };
    }),
    update: vi.fn(async ({ data }: any) => {
      state.payment = { ...state.payment, ...data, updatedAt: new Date() };
      return { ...state.payment };
    }),
    updateMany: vi.fn(async ({ data }: any) => {
      if (!state.payment) return { count: 0 };
      state.payment = { ...state.payment, ...data };
      return { count: 1 };
    }),
  };

  const user = {
    findUnique: vi.fn(async () => ({
      id: state.currentUser.userId,
      customer: { id: state.currentUser.customerId },
      role: state.currentUser.role,
    })),
  };

  const serviceArea = {
    findMany: vi.fn(async () => [
      {
        id: 'sa-southblr',
        name: 'South Bengaluru',
        basePickupCharge: 69.0,
        status: 'ACTIVE',
        etaMinutes: 45,
        boundaryPolygon: JSON.stringify([
          [12.0, 77.0],
          [13.5, 77.0],
          [13.5, 78.0],
          [12.0, 78.0],
        ]),
      },
    ]),
  };

  const address = {
    updateMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }: any) => ({
      id: 'addr-test-1',
      ...data,
    })),
  };

  const wasteCategory = {
    findMany: vi.fn(async () => [
      { id: 'cat_ewaste_01', name: 'Electronic Waste', pricePerKg: 20.0 },
      { id: 'cat_metal_01', name: 'Metal Scrap', pricePerKg: 30.0 },
    ]),
  };

  const database = {
    coupon,
    order: orderTable,
    payment,
    user,
    serviceArea,
    address,
    wasteCategory,
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (callback: any) => {
      return await callback({
        order: orderTable,
        payment,
        address,
        $executeRaw: database.$executeRaw,
        $queryRaw: database.$queryRaw,
      });
    }),
  };

  return { db: database };
});

import { validateAndCalculateCoupon, InvalidCouponError } from '@/lib/services/couponService';
import { POST as validateCouponRoute } from '@/app/api/coupons/validate/route';
import { POST as createOrderRoute } from '@/app/api/orders/route';
import { POST as createPaymentRoute } from '@/app/api/payments/create/route';
import { createOrder, createOrderPayloadHash } from '@/lib/services/orderService';

function createPostRequest(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('Coupon Support in Booking Flow', () => {
  beforeEach(() => {
    state.payment = null;
    state.gatewayCalls = 0;
    state.customerPriorOrdersCount = 0;
    state.currentUser = {
      userId: 'customer-user-1',
      customerId: 'customer-1',
      phone: '9876543210',
      role: 'CUSTOMER',
    };
    state.dbCoupons = {
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
    currentOrder = { ...baseOrder };
  });

  describe('1. Coupon Validation Logic (validateAndCalculateCoupon)', () => {
    it('correctly calculates FLAT discount for WELCOME50 above minOrderValue', async () => {
      const result = await validateAndCalculateCoupon('WELCOME50', 169.0, 'customer-1');
      assert.equal(result.valid, true);
      assert.equal(result.code, 'WELCOME50');
      assert.equal(result.discountType, 'FLAT');
      assert.equal(result.discountAmount, 50.0);
      assert.equal(result.finalAmount, 119.0);
      assert.match(result.message || '', /saved ₹50/i);
    });

    it('correctly calculates PERCENTAGE discount for SOUTHBLR20 with maxDiscount cap', async () => {
      // 20% of 600 = 120, capped at maxDiscount = 100
      const result = await validateAndCalculateCoupon('SOUTHBLR20', 600.0, 'customer-1');
      assert.equal(result.valid, true);
      assert.equal(result.code, 'SOUTHBLR20');
      assert.equal(result.discountType, 'PERCENTAGE');
      assert.equal(result.discountAmount, 100.0);
      assert.equal(result.finalAmount, 500.0);
    });

    it('correctly calculates PERCENTAGE discount for SOUTHBLR20 below maxDiscount cap', async () => {
      // 20% of 250 = 50, below maxDiscount = 100
      const result = await validateAndCalculateCoupon('SOUTHBLR20', 250.0, 'customer-1');
      assert.equal(result.valid, true);
      assert.equal(result.discountAmount, 50.0);
      assert.equal(result.finalAmount, 200.0);
    });

    it('enforces minimum payable amount of ₹1.00 when discount would exceed subtotal', async () => {
      // If flat discount is 50 and subtotal is 50, minimum payable is ₹1.00 and discount is 49
      state.dbCoupons['BIGOFF50'] = {
        code: 'BIGOFF50',
        discountType: 'FLAT',
        discountValue: 50.0,
        minOrderValue: 10.0,
        active: true,
      };
      const result = await validateAndCalculateCoupon('BIGOFF50', 50.0, 'customer-1');
      assert.equal(result.valid, true);
      assert.equal(result.discountAmount, 49.0);
      assert.equal(result.finalAmount, 1.0);
    });

    it('rejects invalid or non-existent coupon codes', async () => {
      const result = await validateAndCalculateCoupon('NONEXISTENT99', 300.0, 'customer-1');
      assert.equal(result.valid, false);
      assert.equal(result.discountAmount, 0);
      assert.match(result.error || '', /invalid/i);
    });

    it('rejects inactive coupons', async () => {
      state.dbCoupons['INACTIVE10'] = {
        code: 'INACTIVE10',
        discountType: 'FLAT',
        discountValue: 10.0,
        minOrderValue: 50.0,
        active: false,
      };
      const result = await validateAndCalculateCoupon('INACTIVE10', 200.0, 'customer-1');
      assert.equal(result.valid, false);
      assert.match(result.error || '', /no longer active/i);
    });

    it('rejects expired coupons', async () => {
      state.dbCoupons['EXPIRED50'] = {
        code: 'EXPIRED50',
        discountType: 'FLAT',
        discountValue: 50.0,
        minOrderValue: 100.0,
        active: true,
        expiryDate: new Date('2020-01-01'), // in the past
      };
      const result = await validateAndCalculateCoupon('EXPIRED50', 200.0, 'customer-1');
      assert.equal(result.valid, false);
      assert.match(result.error || '', /expired/i);
    });

    it('rejects when subtotal is below minimum order value', async () => {
      // WELCOME50 minOrderValue is 100
      const result = await validateAndCalculateCoupon('WELCOME50', 89.0, 'customer-1');
      assert.equal(result.valid, false);
      assert.match(result.error || '', /minimum order value of ₹100/i);
    });

    it('enforces customer eligibility: WELCOME50 is only valid for first pickup order', async () => {
      state.customerPriorOrdersCount = 2; // customer already has prior captured orders
      const result = await validateAndCalculateCoupon('WELCOME50', 200.0, 'customer-1');
      assert.equal(result.valid, false);
      assert.match(result.error || '', /only valid for your first pickup booking/i);
    });
  });

  describe('2. Coupon Validation API Endpoint (POST /api/coupons/validate)', () => {
    it('returns 200 and discount calculations for valid coupon', async () => {
      const req = createPostRequest('/api/coupons/validate', {
        code: 'WELCOME50',
        subtotal: 169.0,
      });
      const res = await validateCouponRoute(req);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.equal(data.data.valid, true);
      assert.equal(data.data.discountAmount, 50.0);
      assert.equal(data.data.finalAmount, 119.0);
    });

    it('returns 400 when coupon code is invalid', async () => {
      const req = createPostRequest('/api/coupons/validate', {
        code: 'FAKEPROMO',
        subtotal: 200.0,
      });
      const res = await validateCouponRoute(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /invalid/i);
    });

    it('returns 400 when subtotal is below coupon minimum', async () => {
      const req = createPostRequest('/api/coupons/validate', {
        code: 'SOUTHBLR20',
        subtotal: 150.0, // Min is 200
      });
      const res = await validateCouponRoute(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /minimum order value/i);
    });

    it('returns 400 when customer is ineligible for first-order coupon', async () => {
      state.customerPriorOrdersCount = 1;
      const req = createPostRequest('/api/coupons/validate', {
        code: 'WELCOME50',
        subtotal: 200.0,
      });
      const res = await validateCouponRoute(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.match(data.message, /first pickup/i);
    });

    it('returns 400 on missing or invalid payload', async () => {
      const req1 = createPostRequest('/api/coupons/validate', { code: '' });
      const res1 = await validateCouponRoute(req1);
      assert.equal(res1.status, 400);

      const req2 = createPostRequest('/api/coupons/validate', { code: 'WELCOME50', subtotal: -10 });
      const res2 = await validateCouponRoute(req2);
      assert.equal(res2.status, 400);
    });
  });

  describe('3. Order Creation & Client Manipulation Immunity', () => {
    const validBookingPayload = {
      phone: '9876543210',
      name: 'Coupon Test Customer',
      address: {
        houseNo: '101 Green Villa',
        street: '15th Cross',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9077,
        lng: 77.5854,
      },
      items: [
        { categoryId: 'cat_ewaste_01', estimatedWeight: 5 }, // 5 * 20 = 100
      ],
      pickupType: 'ASAP' as const,
      financialDirection: 'CUSTOMER_PAYS' as const,
      // Total before discount = 100 (items) + 69 (basePickupCharge) = 169
    };

    it('validates coupon and computes discount entirely on server', async () => {
      const order = await createOrder(
        {
          ...validBookingPayload,
          couponCode: 'WELCOME50',
        },
        'idem-coupon-valid-1',
        state.currentUser
      );

      assert.equal(order.discountAmount, 50.0);
      assert.equal(order.finalAmount, 119.0);
      assert.equal(order.estimatedTotal, 100.0);
      assert.equal(order.pickupCharge, 69.0);
    });

    it('completely ignores client attempts to manipulate discount or final amount', async () => {
      // Even if an attacker passes fraudulent discountAmount and finalAmount in the payload
      const maliciousPayload: any = {
        ...validBookingPayload,
        couponCode: 'WELCOME50',
        discountAmount: 99999.0, // Fraudulent discount
        finalAmount: 0.0,        // Fraudulent free final amount
      };

      const order = await createOrder(
        maliciousPayload,
        'idem-coupon-manip-1',
        state.currentUser
      );

      // Server must ignore the client values and compute the legitimate discount:
      // 169 - 50 = 119
      assert.equal(order.discountAmount, 50.0, 'Server must enforce calculated discount, ignoring client manipulation');
      assert.equal(order.finalAmount, 119.0, 'Server must enforce calculated final amount, ignoring client manipulation');
    });

    it('rejects order creation when an invalid coupon is supplied', async () => {
      await assert.rejects(
        async () => {
          await createOrder(
            {
              ...validBookingPayload,
              couponCode: 'INVALID_COUPON_CODE',
            },
            'idem-coupon-invalid-1',
            state.currentUser
          );
        },
        (err: any) => {
          return err instanceof InvalidCouponError || err?.name === 'InvalidCouponError';
        }
      );
    });

    it('POST /api/orders returns 400 INVALID_COUPON on invalid coupon', async () => {
      const req = createPostRequest(
        '/api/orders',
        {
          ...validBookingPayload,
          couponCode: 'FAKECOUPON',
        },
        { 'Idempotency-Key': 'idem-api-coupon-invalid' }
      );

      const res = await createOrderRoute(req);
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.success, false);
      assert.equal(data.error?.code, 'INVALID_COUPON');
    });
  });

  describe('4. Retrying Payment Without Changing Original Order Amount', () => {
    it('creates Razorpay payment with exact discounted finalAmount without dropping discount', async () => {
      // currentOrder is set up with:
      // estimatedTotal: 100, pickupCharge: 69, discountAmount: 50, finalAmount: 119
      currentOrder = {
        ...baseOrder,
        id: 'order-coupon-retry-1',
        discountAmount: 50,
        finalAmount: 119,
      };

      const res1 = await createPaymentRoute(
        createPostRequest('/api/payments/create', { orderId: currentOrder.id })
      );

      assert.equal(res1.status, 200);
      const body1 = await res1.json();
      assert.equal(body1.success, true);

      // Verify payment response amount is ₹119 and gateway amount in paise is 11900
      assert.equal(body1.data.amount, 119);
      assert.equal(state.lastRazorpayOrderParams?.amountInPaise, 11900);
      assert.equal(state.payment.amount, 119);
      assert.equal(currentOrder.finalAmount, 119);
      assert.equal(currentOrder.discountAmount, 50);

      // Customer retries payment after closing or dismissing modal
      const res2 = await createPaymentRoute(
        createPostRequest('/api/payments/create', { orderId: currentOrder.id })
      );

      assert.equal(res2.status, 200);
      const body2 = await res2.json();
      assert.equal(body2.success, true);
      assert.equal(body2.data.amount, 119);

      // Verify order amounts remain unchanged
      assert.equal(currentOrder.finalAmount, 119);
      assert.equal(currentOrder.discountAmount, 50);
    });
  });

  describe('5. Preventing Duplicate Discounts and Duplicate Orders', () => {
    const bookingInput = {
      phone: '9876543210',
      name: 'Duplicate Test Customer',
      address: {
        houseNo: '202 Lake View',
        street: '8th Main',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9077,
        lng: 77.5854,
      },
      items: [{ categoryId: 'cat_ewaste_01', estimatedWeight: 5 }],
      pickupType: 'ASAP' as const,
      couponCode: 'WELCOME50',
    };

    it('returns identical cached order on retry without stacking discounts', async () => {
      const idempotencyKey = 'idem-coupon-dup-prevent-1';

      const order1 = await createOrder(bookingInput, idempotencyKey, state.currentUser);
      assert.equal(order1.discountAmount, 50.0);
      assert.equal(order1.finalAmount, 119.0);

      // Retry with same idempotency key
      const order2 = await createOrder(bookingInput, idempotencyKey, state.currentUser);
      assert.equal(order2.id, order1.id);
      assert.equal(order2.discountAmount, 50.0, 'Discount must not be duplicated or stacked');
      assert.equal(order2.finalAmount, 119.0, 'Final payable must remain identical');
    });

    it('detects coupon alteration and prevents conflicting idempotency key reuse', async () => {
      const idempotencyKey = 'idem-coupon-conflict-test-1';

      await createOrder(bookingInput, idempotencyKey, state.currentUser);

      // Customer modifies booking to apply a different coupon SOUTHBLR20 with the same key
      const alteredInput = {
        ...bookingInput,
        items: [{ categoryId: 'cat_ewaste_01', estimatedWeight: 10 }], // 200 subtotal
        couponCode: 'SOUTHBLR20',
      };

      await assert.rejects(
        async () => {
          await createOrder(alteredInput, idempotencyKey, state.currentUser);
        },
        (err: any) => {
          return err?.name === 'OrderIdempotencyConflictError';
        }
      );
    });
  });
});
