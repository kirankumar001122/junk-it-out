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
  createdOrders: [] as any[],
};

const baseOrder = {
  id: 'order-no-coupon-1',
  customerId: 'customer-1',
  financialDirection: 'CUSTOMER_PAYS',
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'INITIATED',
  estimatedTotal: 75,
  pickupCharge: 50,
  discountAmount: 0,
  finalAmount: 50,
  orderNumber: 'JIO-BOOK-001',
  createdAt: new Date('2026-10-26T10:00:00.000Z'),
  address: { area: 'JP Nagar' },
  items: [{ estimatedWeight: 5 }],
};

const baseBookingInput = {
  phone: '9876543210',
  name: 'Standard Booking Customer',
  address: {
    houseNo: '12',
    street: 'Main Road',
    area: 'JP Nagar',
    pincode: '560078',
    lat: 12.9166,
    lng: 77.5996,
  },
  items: [{ categoryId: 'cat_ewaste_01', estimatedWeight: 5 }],
  pickupType: 'ASAP' as const,
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
    id: 'pay_test_1',
    order_id: 'order_rzp_1',
    amount: 5000,
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
  const orderTable = {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.id === currentOrder.id) {
        return {
          ...currentOrder,
          payments: state.payment ? [{ ...state.payment }] : [],
        };
      }
      return state.createdOrders.find((o) => o.id === where.id) || null;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      if (where?.customerId && where?.status !== 'CANCELLED') {
        return state.customerPriorOrdersCount > 0 ? { id: 'prior-order-1' } : null;
      }
      return null;
    }),
    create: vi.fn(async ({ data }: any) => {
      const created = {
        id: `ord_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        ...data,
        payments: data.payments?.create ? [{ id: 'pmt_init_1', ...data.payments.create }] : [],
        items: data.items?.create || [],
        address: { area: 'JP Nagar' },
      };
      state.createdOrders.push(created);
      currentOrder = { ...created };
      return created;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      if (where.id === currentOrder.id) {
        currentOrder = { ...currentOrder, ...data };
        return currentOrder;
      }
      return null;
    }),
  };

  const payment = {
    findFirst: vi.fn(async () => state.payment),
    create: vi.fn(async ({ data }: any) => {
      const p = { id: `pmt_${Date.now()}`, ...data };
      state.payment = p;
      return p;
    }),
    update: vi.fn(async ({ data }: any) => {
      if (state.payment) {
        state.payment = { ...state.payment, ...data };
      }
      return state.payment;
    }),
    count: vi.fn(async () => 0),
  };

  const address = {
    updateMany: vi.fn(async () => ({ count: 1 })),
    create: vi.fn(async ({ data }: any) => ({ id: 'addr_new_1', ...data })),
  };

  const user = {
    findUnique: vi.fn(async () => ({
      id: state.currentUser.userId,
      phone: state.currentUser.phone,
      customer: { id: state.currentUser.customerId },
      addresses: [{ id: 'addr_default_1', isDefault: true }],
    })),
  };

  const serviceArea = {
    findMany: vi.fn(async () => [
      {
        id: 'zone_south_blr',
        name: 'South Bengaluru Cluster',
        pincode: '560078',
        polygon: JSON.stringify([
          [12.8, 77.5],
          [13.0, 77.5],
          [13.0, 77.7],
          [12.8, 77.7],
        ]),
        centerLat: 12.9166,
        centerLng: 77.5996,
        basePickupCharge: 50.0,
        active: true,
      },
    ]),
  };

  const wasteCategory = {
    findMany: vi.fn(async ({ where }: any) => {
      const all = [
        { id: 'cat_ewaste_01', name: 'E-Waste', type: 'RECYCLABLE_BUY', pricePerKg: 15.0, minWeightKg: 0.5, maxWeightKg: 1000.0, active: true },
        { id: 'cat_plastic_02', name: 'Plastic Scrap', type: 'RECYCLABLE_BUY', pricePerKg: 12.0, active: true },
        { id: 'cat_bulky_03', name: 'Bulky Waste', type: 'WASTE_CHARGE', pricePerKg: 20.0, active: true },
      ];
      if (where?.id?.in) {
        return all.filter((c) => where.id.in.includes(c.id));
      }
      return all;
    }),
  };

  const idempotencyRecords = new Map<string, any>();
  const orderIdempotency = {
    findUnique: vi.fn(async ({ where }: any) => idempotencyRecords.get(where.key) || null),
    create: vi.fn(async ({ data }: any) => {
      idempotencyRecords.set(data.key, data);
      return data;
    }),
  };

  const database = {
    order: orderTable,
    payment,
    address,
    user,
    serviceArea,
    wasteCategory,
    orderIdempotency,
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (callback: any) => {
      return await callback({
        order: orderTable,
        payment,
        address,
        orderIdempotency,
        $executeRaw: database.$executeRaw,
        $queryRaw: database.$queryRaw,
      });
    }),
  };

  return { db: database };
});

import { POST as createOrderRoute } from '@/app/api/orders/route';
import { POST as createPaymentRoute } from '@/app/api/payments/create/route';
import {
  createOrder,
  createOrderPayloadHash,
  InvalidWasteCategoryError,
  InvalidBookingWeightError,
} from '@/lib/services/orderService';
import { calculateTotalBookingWeight } from '@/lib/validations/schemas';

function createPostRequest(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

describe('Booking Flow and Pricing Correctness (Coupons Removed)', () => {
  beforeEach(() => {
    state.payment = null;
    state.gatewayCalls = 0;
    state.lastRazorpayOrderParams = null;
    state.customerPriorOrdersCount = 0;
    state.createdOrders = [];
    currentOrder = { ...baseOrder };
  });

  describe('1. Clean Order Creation & Authoritative Pricing', () => {
    it('creates standard scrap booking charging exactly base pickup service fee upfront', async () => {
      // 5 kg E-Waste @ ₹15/kg = ₹75.00 scrap buy value
      // Base pickup charge = ₹50.00
      // Customer pays strictly ₹50.00 upfront service fee
      const order = await createOrder(baseBookingInput, `idem-${Date.now()}-1`, state.currentUser);

      assert.equal(order.pickupCharge, 50.0);
      assert.equal(order.discountAmount, 0.0, 'Discounts must be 0.0 with coupons removed');
      assert.equal(order.finalAmount, 50.0, 'Customer upfront payable must strictly equal base pickup fee ₹50.00');
      assert.equal(order.estimatedTotal, 75.0, 'Scrap buy value is recorded as estimatedTotal');
      assert.equal(order.financialDirection, 'CUSTOMER_PAYS');
    });

    it('completely ignores client attempts to pass coupons or discounts', async () => {
      const manipulatedInput = {
        ...baseBookingInput,
        couponCode: 'WELCOME50', // Passing a legacy coupon code
        discountAmount: 50.0,    // Attempting to inject client discount
        finalAmount: 19.0,       // Attempting to set manipulated final amount
      };

      const order = await createOrder(manipulatedInput, `idem-${Date.now()}-2`, state.currentUser);

      assert.equal(order.discountAmount, 0.0, 'Must ignore client discount and coupon code');
      assert.equal(order.finalAmount, 50.0, 'Final amount must remain authoritative base pickup charge');
    });

    it('correctly adds waste disposal charges to upfront customer charges', async () => {
      // 2 kg Bulky Waste (WASTE_CHARGE) @ ₹20/kg = ₹40.00 disposal charge
      // Base pickup charge = ₹50.00
      // Total customer upfront payable = 50 + 40 = ₹90.00
      const bulkyInput = {
        ...baseBookingInput,
        items: [{ categoryId: 'cat_bulky_03', estimatedWeight: 2 }],
      };

      const order = await createOrder(bulkyInput, `idem-${Date.now()}-3`, state.currentUser);

      assert.equal(order.pickupCharge, 50.0);
      assert.equal(order.discountAmount, 0.0);
      assert.equal(order.finalAmount, 90.0, 'Disposal charges must add to base pickup charge');
    });
  });

  describe('2. Weight Boundaries & Category Validation', () => {
    it('validates total booking weight across items at inclusive category boundaries', async () => {
      // Under minimum (< 0.5 kg)
      const lightItems = [{ categoryId: 'cat_ewaste_01', estimatedWeight: 0.3 }];
      const lightWeight = calculateTotalBookingWeight(lightItems);
      assert.equal(lightWeight, 0.3);

      await assert.rejects(
        async () => {
          await createOrder({ ...baseBookingInput, items: lightItems }, `idem-${Date.now()}-light`, state.currentUser);
        },
        (err: any) => err instanceof InvalidBookingWeightError || err.name === 'InvalidBookingWeightError'
      );

      // Over maximum (> 1000 kg)
      const heavyItems = [{ categoryId: 'cat_ewaste_01', estimatedWeight: 1001 }];
      await assert.rejects(
        async () => {
          await createOrder({ ...baseBookingInput, items: heavyItems }, `idem-${Date.now()}-heavy`, state.currentUser);
        },
        (err: any) => err instanceof InvalidBookingWeightError || err.name === 'InvalidBookingWeightError'
      );
    });

    it('rejects unknown waste categories without fallback pricing', async () => {
      const unknownItems = [{ categoryId: 'non_existent_cat_999', estimatedWeight: 5 }];

      await assert.rejects(
        async () => {
          await createOrder({ ...baseBookingInput, items: unknownItems }, `idem-${Date.now()}-unknown`, state.currentUser);
        },
        (err: any) => err instanceof InvalidWasteCategoryError || err.name === 'InvalidWasteCategoryError'
      );
    });
  });

  describe('3. Payment Gateway Integration & Retries', () => {
    it('creates Razorpay payment for exact upfront customer charge', async () => {
      const order = await createOrder(baseBookingInput, `idem-${Date.now()}-pay`, state.currentUser);

      const payReq = createPostRequest('/api/payments/create', { orderId: order.id });
      const payRes = await createPaymentRoute(payReq);

      assert.equal(payRes.status, 200);
      const body = await payRes.json();
      assert.equal(body.success, true);
      assert.equal(body.data.amount, 50.0);
      assert.equal(state.lastRazorpayOrderParams.amountInPaise, 5000);
    });

    it('preserves authoritative order amount on payment retry', async () => {
      currentOrder = {
        ...baseOrder,
        id: 'retry-order-1',
        pickupCharge: 50,
        discountAmount: 0,
        finalAmount: 50,
      };

      const payReq = createPostRequest('/api/payments/create', { orderId: 'retry-order-1' });
      const payRes = await createPaymentRoute(payReq);

      assert.equal(payRes.status, 200);
      const body = await payRes.json();
      assert.equal(body.data.amount, 50.0);
      assert.equal(state.lastRazorpayOrderParams.amountInPaise, 5000);
    });
  });

  describe('4. Idempotency & Clean Booking Hash', () => {
    it('returns identical order on retry with same idempotency key without changing amounts', async () => {
      const key = `idem-repeat-${Date.now()}`;
      const first = await createOrder(baseBookingInput, key, state.currentUser);
      const second = await createOrder(baseBookingInput, key, state.currentUser);

      assert.equal(first.id, second.id, 'Idempotent retry must return the exact same order');
      assert.equal(second.finalAmount, 50.0);
      assert.equal(second.discountAmount, 0.0);
    });
  });
});
