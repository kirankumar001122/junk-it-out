import assert from 'node:assert/strict';
import { beforeEach, describe, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { OrderExecutionTimer } from '@/lib/observability/orderTimingDiagnostics';
import { checkGeofenceServiceability, invalidateServiceAreaCache } from '@/lib/services/serviceAreaService';

const state = {
  payment: null as any,
  gatewayCalls: 0,
  gatewayShouldFail: false,
  gatewayErrorToThrow: null as any,
  gatewayDelayMs: 0,
  postGatewayTxShouldFail: false,
  lastRazorpayOrderParams: null as any,
  currentUser: {
    userId: 'customer-user-timing-1',
    customerId: 'customer-timing-1',
    phone: '9876543210',
    role: 'CUSTOMER',
    addresses: [] as any[],
  } as any,
  logs: [] as any[],
  serviceAreaFindManyCalls: 0,
  addressCreateCalls: 0,
  ordersById: new Map<string, any>(),
};

const baseOrder = {
  id: 'order-timing-1',
  customerId: 'customer-timing-1',
  financialDirection: 'CUSTOMER_PAYS',
  status: 'BOOKING_RECEIVED',
  paymentStatus: 'PENDING',
  estimatedTotal: 100,
  pickupCharge: 69,
  discountAmount: 0,
  finalAmount: 169,
  orderNumber: 'JIO-TIME-001',
  createdAt: new Date('2026-10-29T10:00:00.000Z'),
  address: { area: 'JP Nagar', houseNo: '101', street: '15th Cross', pincode: '560078', lat: 12.9077, lng: 77.5854 },
  items: [{ id: 'item-1', categoryId: 'cat_ewaste_01', estimatedWeight: 5, ratePerKg: 20, subtotal: 100, category: { id: 'cat_ewaste_01', name: 'Electronic Waste' } }],
  statusHistory: [{ id: 'sh-1', status: 'BOOKING_RECEIVED' }],
  payments: [] as any[],
};

let currentOrder = { ...baseOrder };

vi.mock('@/lib/auth/middleware', () => ({
  getAuthUser: vi.fn(async () => state.currentUser),
}));

vi.mock('@/lib/payments/razorpay', () => {
  class RazorpayOrderCreationError extends Error {
    public uncertain: boolean;
    public statusCode: number;
    constructor(message: string, uncertain = false, statusCode = 502) {
      super(message);
      this.name = 'RazorpayOrderCreationError';
      this.uncertain = uncertain;
      this.statusCode = statusCode;
    }
  }

  return {
    createRazorpayOrder: vi.fn(async (params: any) => {
      if (state.gatewayErrorToThrow) {
        throw state.gatewayErrorToThrow;
      }
      if (state.gatewayShouldFail) {
        throw new RazorpayOrderCreationError('Razorpay authentication failed.', false, 401);
      }
      if (state.gatewayDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, state.gatewayDelayMs));
      }
      state.gatewayCalls += 1;
      state.lastRazorpayOrderParams = params;
      return {
        id: `order_rzp_mock_${state.gatewayCalls}`,
        amount: params.amountInPaise,
        currency: 'INR',
        keyId: 'rzp_test_key_diagnostics',
      };
    }),
    fetchRazorpayPayment: vi.fn(async () => ({
      id: 'pay_timing_1',
      order_id: 'order_rzp_mock_1',
      amount: 16900,
      currency: 'INR',
      status: 'captured',
    })),
    verifyRazorpayPaymentSignature: vi.fn(() => true),
    verifyRazorpayWebhookSignature: vi.fn(() => true),
    RazorpayOrderCreationError,
  };
});

vi.mock('@/lib/db', () => {
  const coupon = {
    findUnique: vi.fn(async () => null),
  };

  const orderTable = {
    findUnique: vi.fn(async ({ where }: any) => {
      if (state.ordersById.has(where.id)) {
        const ord = state.ordersById.get(where.id);
        return {
          ...ord,
          payments: state.payment ? [{ ...state.payment }] : [],
        };
      }
      if (where.id === currentOrder.id) {
        return {
          ...currentOrder,
          payments: state.payment ? [{ ...state.payment }] : [],
        };
      }
      return null;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      if (where.id && state.ordersById.has(where.id)) {
        return { ...state.ordersById.get(where.id) };
      }
      if (where.id === currentOrder.id) {
        return { ...currentOrder };
      }
      return null;
    }),
    count: vi.fn(async () => 0),
    create: vi.fn(async ({ data }: any) => {
      const createdId = `order-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      let nestedPayments: any[] = [];
      if (data.payments?.create) {
        state.payment = {
          id: `pay-${Date.now()}`,
          orderId: createdId,
          ...data.payments.create,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        nestedPayments = [state.payment];
      }
      const created = {
        id: createdId,
        ...data,
        items: (data.items?.create || []).map((i: any) => ({
          ...i,
          category: { id: i.categoryId, name: 'Electronic Waste' },
        })),
        statusHistory: [{ id: 'sh-new', newStatus: 'BOOKING_RECEIVED' }],
        payments: nestedPayments,
      };
      currentOrder = created;
      state.ordersById.set(created.id, created);
      return { ...created };
    }),
    update: vi.fn(async ({ where, data }: any) => {
      if (where?.id && state.ordersById.has(where.id)) {
        const ord = { ...state.ordersById.get(where.id), ...data };
        state.ordersById.set(where.id, ord);
        currentOrder = ord;
        return { ...ord };
      }
      currentOrder = { ...currentOrder, ...data };
      return { ...currentOrder };
    }),
  };

  const payment = {
    findFirst: vi.fn(async ({ where }: any) => {
      if (!state.payment) return null;
      if (where.orderId && state.payment.orderId !== where.orderId) {
        return null;
      }
      if (where.status?.in && !where.status.in.includes(state.payment.status)) {
        return null;
      }
      return { ...state.payment, order: { ...currentOrder } };
    }),
    findUnique: vi.fn(async () => (state.payment ? { ...state.payment } : null)),
    create: vi.fn(async ({ data }: any) => {
      state.payment = {
        id: `pay-${Date.now()}`,
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      return { ...state.payment };
    }),
    update: vi.fn(async ({ data }: any) => {
      if (state.payment) {
        state.payment = { ...state.payment, ...data, updatedAt: new Date() };
        return { ...state.payment };
      }
      return null;
    }),
  };

  const user = {
    findUnique: vi.fn(async () => ({
      id: state.currentUser.userId,
      customer: { id: state.currentUser.customerId },
      role: state.currentUser.role,
      addresses: state.currentUser.addresses || [],
    })),
    findFirst: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => ({
      id: state.currentUser.userId,
      phone: data.phone,
      name: data.name,
      role: 'CUSTOMER',
      customer: { id: state.currentUser.customerId },
      addresses: [],
    })),
    update: vi.fn(async ({ data }: any) => ({
      id: state.currentUser.userId,
      ...data,
      role: 'CUSTOMER',
      customer: { id: state.currentUser.customerId },
      addresses: [],
    })),
  };

  const serviceArea = {
    findMany: vi.fn(async () => {
      state.serviceAreaFindManyCalls += 1;
      return [
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
      ];
    }),
  };

  const address = {
    updateMany: vi.fn(async () => ({ count: 0 })),
    create: vi.fn(async ({ data }: any) => {
      state.addressCreateCalls += 1;
      return {
        id: 'addr-timing-1',
        ...data,
      };
    }),
  };

  const wasteCategory = {
    findMany: vi.fn(async ({ where }: any) => [
      { id: 'cat_ewaste_01', name: 'Electronic Waste', pricePerKg: 20.0, minWeightKg: 5, maxWeightKg: 20, active: true },
    ].filter((category) => where.id.in.includes(category.id) && (!where.active || category.active === where.active))),
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
    $transaction: vi.fn(async (input: any) => {
      if (Array.isArray(input)) {
        if (state.postGatewayTxShouldFail) {
          throw new Error('Database transaction timeout during post-gateway updates');
        }
        return Promise.all(input);
      }
      return await input({
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

import { POST as createOrderRoute } from '@/app/api/orders/route';
import { RazorpayOrderCreationError } from '@/lib/payments/razorpay';

function createPostRequest(url: string, body: Record<string, unknown>, headers: Record<string, string> = {}) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('Payment Delay Diagnostics & Timing Telemetry', () => {
  beforeEach(() => {
    state.payment = null;
    state.gatewayCalls = 0;
    state.gatewayShouldFail = false;
    state.gatewayErrorToThrow = null;
    state.gatewayDelayMs = 0;
    state.postGatewayTxShouldFail = false;
    state.lastRazorpayOrderParams = null;
    state.logs = [];
    state.serviceAreaFindManyCalls = 0;
    state.addressCreateCalls = 0;
    state.ordersById.clear();
    state.currentUser.addresses = [];
    invalidateServiceAreaCache();
    vi.spyOn(console, 'info').mockImplementation((msg: string) => {
      try {
        state.logs.push(JSON.parse(msg));
      } catch {}
    });
  });

  const validBookingPayload = {
    phone: '9876543210',
    name: 'Timing Test Customer',
    address: {
      houseNo: '101 Green Villa',
      street: '15th Cross',
      area: 'JP Nagar',
      pincode: '560078',
      lat: 12.9077,
      lng: 77.5854,
    },
    items: [
      { categoryId: 'cat_ewaste_01', estimatedWeight: 5 },
    ],
    pickupType: 'ASAP' as const,
    financialDirection: 'CUSTOMER_PAYS' as const,
  };

  it('order execution timer records phases and produces non-PII diagnostic summary with defensive allowlist', () => {
    const timer = new OrderExecutionTimer('test-correlation-id');
    timer.recordPhase('phase_1');
    timer.recordPhase('phase_2');
    const summary = timer.finish({
      orderId: 'test-order-123',
      orderNumber: 'JIO-123',
      // The following PII fields should be stripped by the defensive allowlist:
      customerPhone: '9876543210',
      customerAddress: '101 Green Villa',
      customerName: 'Timing Test Customer',
      authToken: 'secret_jwt_token',
    } as any);

    assert.equal(summary.correlationId, 'test-correlation-id');
    assert.equal(summary.event, 'order.execution.timing');
    assert.equal(summary.phases.length, 2);
    assert.equal(summary.phases[0].phase, 'phase_1');
    assert.equal(summary.phases[1].phase, 'phase_2');
    assert.equal((summary as any).orderId, 'test-order-123');
    assert.equal((summary as any).orderNumber, 'JIO-123');
    assert.ok(summary.totalDurationMs >= 0);

    // Verify absence of any PII or secrets in serialized diagnostic log
    const logStr = JSON.stringify(summary);
    assert.ok(!logStr.includes('9876543210'), 'Must not contain phone number');
    assert.ok(!logStr.includes('Green Villa'), 'Must not contain address');
    assert.ok(!logStr.includes('Timing Test Customer'), 'Must not contain customer name');
    assert.ok(!logStr.includes('secret_jwt_token'), 'Must not contain auth token');
    assert.equal((summary as any).customerPhone, undefined);
    assert.equal((summary as any).authToken, undefined);
  });

  it('POST /api/orders creates order and initializes gateway payment in advance with corrected INITIATED status', async () => {
    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      {
        'Idempotency-Key': 'idem-timing-test-1',
        'x-request-id': 'b87d8916-24a9-4d69-a1d2-08537b0178a9',
      }
    );

    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data.id);
    assert.ok(body.data.orderNumber);

    // Regression check: paymentStatus in responseData must reflect INITIATED rather than stale PENDING
    assert.equal(body.data.paymentStatus, 'INITIATED', 'Response data must reflect INITIATED payment status');
    assert.equal(state.payment.status, 'INITIATED', 'Database payment row must reflect INITIATED');
    assert.ok(state.payment.gatewayOrderId, 'Database payment row must have gatewayOrderId');

    // Verify paymentConfig is returned
    assert.ok(body.data.paymentConfig, 'Must return paymentConfig in single round-trip');
    assert.equal(body.data.paymentConfig.amount, 169);
    assert.equal(body.data.paymentConfig.currency, 'INR');
    assert.ok(body.data.paymentConfig.gatewayOrderId.startsWith('order_rzp_mock_'));
    assert.equal(state.gatewayCalls, 1);

    // Verify diagnostic telemetry event was emitted
    const timingLog = state.logs.find((l) => l.event === 'order.execution.timing');
    assert.ok(timingLog, 'Must emit order.execution.timing log');
    assert.equal(timingLog.correlationId, 'b87d8916-24a9-4d69-a1d2-08537b0178a9');
    assert.equal(timingLog.hasPaymentConfig, true);
    assert.ok(timingLog.phases.some((p: any) => p.phase === 'auth_and_input_validation'));
    assert.ok(timingLog.phases.some((p: any) => p.phase === 'order_creation_tx'));
    assert.ok(timingLog.phases.some((p: any) => p.phase === 'razorpay_gateway_call'));
    assert.ok(timingLog.phases.some((p: any) => p.phase === 'payment_and_order_db_updates'));
  });

  it('preserves PENDING paymentStatus and marks payment FAILED via compensation if gateway fails with definite error', async () => {
    state.gatewayShouldFail = true;

    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      {
        'Idempotency-Key': 'idem-timing-test-deferred',
        'x-request-id': 'c98e8916-24a9-4d69-a1d2-08537b0178a0',
      }
    );

    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);

    // When gateway order fails definitely, paymentConfig is not present and paymentStatus remains PENDING
    assert.equal(body.data.paymentConfig, undefined);
    assert.equal(body.data.paymentStatus, 'PENDING');

    // Safe compensation: payment must be marked FAILED so retry can create a new payment
    assert.equal(state.payment.status, 'FAILED', 'Payment record must be marked FAILED on definite gateway rejection');
  });

  it('preserves CREATION_PENDING and does not mark FAILED if gateway fails with uncertain timeout', async () => {
    state.gatewayErrorToThrow = new RazorpayOrderCreationError(
      'Connection to Razorpay gateway timed out.',
      true,
      502
    );

    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      {
        'Idempotency-Key': 'idem-timing-test-uncertain-gw',
        'x-request-id': 'c98e8916-24a9-4d69-a1d2-08537b0178a5',
      }
    );

    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);

    assert.equal(body.data.paymentConfig, undefined);
    assert.equal(body.data.paymentStatus, 'PENDING');

    // Crucial invariant: must NOT mark FAILED when outcome is uncertain, preventing duplicate gateway orders
    assert.equal(state.payment.status, 'CREATION_PENDING', 'Payment record must remain CREATION_PENDING on uncertain timeout');
  });

  it('safely preserves created gatewayOrderId and marks INITIATED if post-gateway atomic transaction fails', async () => {
    state.postGatewayTxShouldFail = true;

    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      {
        'Idempotency-Key': 'idem-timing-test-db-fail',
        'x-request-id': 'd09f8916-24a9-4d69-a1d2-08537b0178a1',
      }
    );

    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);

    // Order response should remain PENDING without paymentConfig
    assert.equal(body.data.paymentConfig, undefined);
    assert.equal(body.data.paymentStatus, 'PENDING');

    // Crucial invariant: because Razorpay order was already created, payment must preserve gatewayOrderId
    // and status INITIATED so subsequent customer payment retries reuse it without duplicate charges
    assert.equal(state.payment.status, 'INITIATED', 'Payment record must preserve status INITIATED');
    assert.equal(state.payment.gatewayOrderId, 'order_rzp_mock_1', 'Must preserve gatewayOrderId to prevent duplicate order on retry');
  });

  it('accurately measures slow gateway responses without dropping transaction consistency', async () => {
    state.gatewayDelayMs = 150; // Simulate 150ms slow network roundtrip

    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      {
        'Idempotency-Key': 'idem-timing-test-slow-gw',
        'x-request-id': 'e10f8916-24a9-4d69-a1d2-08537b0178a2',
      }
    );

    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.paymentStatus, 'INITIATED');
    assert.ok(body.data.paymentConfig);

    const timingLog = state.logs.find((l) => l.correlationId === 'e10f8916-24a9-4d69-a1d2-08537b0178a2');
    assert.ok(timingLog);
    const gwPhase = timingLog.phases.find((p: any) => p.phase === 'razorpay_gateway_call');
    assert.ok(gwPhase);
    assert.ok(gwPhase.durationMs >= 140, 'Gateway phase duration must reflect measured slow roundtrip');
  });

  it('serviceAreaService caches boundary polygons in-memory to eliminate redundant DB lookups', async () => {
    assert.equal(state.serviceAreaFindManyCalls, 0);

    // First call: queries database
    const res1 = await checkGeofenceServiceability(12.9077, 77.5854, 'JP Nagar');
    assert.equal(res1.serviceable, true);
    assert.equal(state.serviceAreaFindManyCalls, 1);

    // Second call: hits in-memory cache, no DB query
    const res2 = await checkGeofenceServiceability(12.9077, 77.5854, 'JP Nagar');
    assert.equal(res2.serviceable, true);
    assert.equal(state.serviceAreaFindManyCalls, 1, 'Subsequent service area check must use in-memory cache');

    // Invalidate cache: next call queries database again
    invalidateServiceAreaCache();
    const res3 = await checkGeofenceServiceability(12.9077, 77.5854, 'JP Nagar');
    assert.equal(res3.serviceable, true);
    assert.equal(state.serviceAreaFindManyCalls, 2, 'Query count must increment after cache invalidation');
  });

  it('handles duplicate order submissions idempotently without creating duplicate gateway orders', async () => {
    const idempotencyKey = 'idem-duplicate-submission-key-1';

    // First request
    const req1 = createPostRequest(
      '/api/orders',
      validBookingPayload,
      { 'Idempotency-Key': idempotencyKey }
    );
    const res1 = await createOrderRoute(req1);
    assert.equal(res1.status, 201);
    const body1 = await res1.json();
    assert.equal(body1.success, true);
    assert.equal(body1.data.paymentStatus, 'INITIATED');
    assert.equal(state.gatewayCalls, 1);
    const firstGatewayOrderId = body1.data.paymentConfig.gatewayOrderId;

    // Duplicate request with the identical payload and idempotency key
    const req2 = createPostRequest(
      '/api/orders',
      validBookingPayload,
      { 'Idempotency-Key': idempotencyKey }
    );
    const res2 = await createOrderRoute(req2);
    assert.equal(res2.status, 201);
    const body2 = await res2.json();
    assert.equal(body2.success, true);

    // Idempotent retry must reuse the existing gateway order and NOT call Razorpay again
    assert.equal(body2.data.id, body1.data.id, 'Must return identical order ID');
    assert.equal(body2.data.paymentConfig.gatewayOrderId, firstGatewayOrderId, 'Must reuse identical gateway order ID');
    assert.equal(state.gatewayCalls, 1, 'Must NOT make duplicate gateway calls');
  });

  it('reuses existing default address when identical, avoiding unnecessary address DB writes', async () => {
    // Populate user with matching saved default address
    state.currentUser.addresses = [
      {
        id: 'addr-existing-default-1',
        userId: state.currentUser.userId,
        houseNo: '101 Green Villa',
        street: '15th Cross',
        area: 'JP Nagar',
        pincode: '560078',
        lat: 12.9077,
        lng: 77.5854,
        isDefault: true,
      },
    ];

    assert.equal(state.addressCreateCalls, 0);

    const req = createPostRequest(
      '/api/orders',
      validBookingPayload,
      { 'Idempotency-Key': 'idem-address-reuse-test-1' }
    );
    const res = await createOrderRoute(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.success, true);

    // Address create was NOT called because existing default address matched
    assert.equal(state.addressCreateCalls, 0, 'Must reuse existing default address without extra DB create call');
  });
});
