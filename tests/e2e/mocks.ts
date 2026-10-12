import type { Page, Route } from '@playwright/test';

export const BASE_URL = `http://127.0.0.1:${process.env.JIO_E2E_PORT || '3210'}`;

export type E2EAddress = {
  id: string; userId: string; label: string; name: string; phone: string;
  houseNo: string; building?: string | null; street: string; area: string;
  landmark?: string | null; city: string; pincode: string; lat: number; lng: number;
  formattedAddress?: string | null; googlePlaceId?: string | null; isDefault: boolean;
  createdAt: string;
};

export function syntheticAddress(id: string, userId: string, label: string, isDefault: boolean): E2EAddress {
  return {
    id, userId, label, name: 'Synthetic Customer', phone: '9000000001',
    houseNo: 'Synthetic flat', street: 'Synthetic Cross', area: 'Synthetic Area',
    city: 'Bengaluru', pincode: '560001', lat: 12.91, lng: 77.59,
    formattedAddress: 'Synthetic flat, Synthetic Cross, Synthetic Area', isDefault,
    createdAt: isDefault ? '2026-01-01T00:00:00.000Z' : '2026-01-02T00:00:00.000Z',
  };
}

export function syntheticOrder(id: string, customerId: string, overrides: Record<string, unknown> = {}) {
  return {
    id, orderNumber: `JIO-${id}`, customerId, agentId: null,
    status: 'BOOKING_RECEIVED', financialDirection: 'CUSTOMER_PAYS',
    paymentStatus: 'CAPTURED', estimatedTotal: 156, finalAmount: 156,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    customer: { userId: `user-${customerId}`, user: { id: `user-${customerId}`, name: 'Synthetic Customer', phone: '9000000001' } },
    agent: null,
    address: syntheticAddress(`address-${customerId}`, `user-${customerId}`, 'Home', true),
    items: [{ id: 'item-1', categoryId: 'paper', estimatedWeight: 2, actualWeight: null, ratePerKg: 25, subtotal: 50, category: { name: 'Paper & Cardboard' } }],
    invoices: [], statusHistory: [], payments: [], weightRecords: [], settlement: null,
    ...overrides,
  };
}

export type MockOptions = {
  role?: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'GUEST';
  customerId?: string;
  userId?: string;
  agentId?: string;
  addresses?: E2EAddress[];
  orders?: any[];
  paymentStatus?: 'CAPTURED' | 'AUTHORIZED' | 'FAILED';
  checkoutOutcome?: 'captured' | 'failed' | 'dismissed';
  serviceable?: boolean;
  failPaths?: string[];
};

export async function mockApp(page: Page, options: MockOptions = {}) {
  const role = options.role || 'CUSTOMER';
  let currentRole = role;
  const customerId = options.customerId || 'customer-a';
  const userId = options.userId || `user-${customerId}`;
  const agentId = options.agentId || 'agent-a';
  let addresses = structuredClone(options.addresses || [syntheticAddress(`address-${customerId}`, userId, 'Home', true)]);
  let orders = structuredClone(options.orders || [syntheticOrder('order-a', customerId)]);
  const calls: Array<{ method: string; path: string; body?: any; idempotencyKey?: string | null }> = [];
  const unexpected: string[] = [];
  const failed = new Set(options.failPaths || []);
  const orderById = (id: string) => orders.find((order) => order.id === id || order.orderNumber === id);

  await page.addInitScript((paymentOutcome) => {
    const harness: any = { paymentOutcome, eventSources: [], lastCheckout: null };
    class FakeEventSource extends EventTarget {
      url: string;
      closed = false;
      constructor(url: string) { super(); this.url = url; harness.eventSources.push(this); }
      close() { this.closed = true; }
      emit(event: string, data: unknown) {
        const message = new MessageEvent(event, { data: JSON.stringify(data) });
        this.dispatchEvent(message);
      }
    }
    class FakeRazorpay {
      options: any;
      callbacks: Record<string, Function[]> = {};
      constructor(options: any) { this.options = options; harness.lastCheckout = this; }
      on(name: string, callback: Function) { (this.callbacks[name] ||= []).push(callback); }
      open() {
        const finish = () => {
          if (harness.paymentOutcome === 'failed') {
            (this.callbacks['payment.failed'] || []).forEach((callback) => callback({ error: { description: 'Synthetic payment failure' } }));
          } else if (harness.paymentOutcome === 'dismissed') {
            this.options.modal.ondismiss();
          } else {
            void this.options.handler({ razorpay_order_id: 'rzp_synthetic_order', razorpay_payment_id: 'pay_synthetic', razorpay_signature: 'synthetic-signature' });
          }
        };
        setTimeout(finish, 0);
      }
    }
    (window as any).__jioE2E = harness;
    (window as any).EventSource = FakeEventSource;
    (window as any).Razorpay = FakeRazorpay;
  }, options.checkoutOutcome || 'captured');

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== BASE_URL) {
      unexpected.push(`external request blocked: ${url.origin}${url.pathname}`);
      await route.abort('blockedbyclient');
      return;
    }
    if (!url.pathname.startsWith('/api/')) {
      await route.continue();
      return;
    }

    const method = request.method().toUpperCase();
    const apiPath = url.pathname;
    const body = request.postDataJSON?.() ?? undefined;
    calls.push({ method, path: apiPath, body, idempotencyKey: request.headers()['idempotency-key'] || null });
    if (failed.has(`${method} ${apiPath}`) || failed.has(apiPath)) {
      await route.fulfill({ status: 503, json: { success: false, message: 'Synthetic network failure.' } });
      return;
    }
    const ok = (data: unknown, status = 200) => route.fulfill({ status, json: { success: true, data } });
    const denied = (status = 403) => route.fulfill({ status, json: { success: false, message: 'Synthetic access denied.' } });

    if (apiPath === '/api/auth/me' && method === 'GET') {
      if (currentRole === 'GUEST') return denied(401);
      return ok({ user: { id: userId, customerId, name: 'Synthetic Customer', phone: '9000000001', role: currentRole, customer: { id: customerId }, agent: currentRole === 'AGENT' ? { id: agentId, status: 'AVAILABLE', vehicleNumber: 'SYNTHETIC-1' } : null } });
    }
    if (apiPath === '/api/auth/send-otp' && method === 'POST') return ok({ cooldownSeconds: 0 });
    if (apiPath === '/api/auth/verify-otp' && method === 'POST') {
      if (body?.code !== '123456') return denied(400);
      currentRole = 'CUSTOMER';
      return ok({ verified: true });
    }
    if (apiPath === '/api/auth/logout' && method === 'POST') return ok({ loggedOut: true });
    if (apiPath === '/api/waste-categories' && method === 'GET') return ok([
      { id: 'paper', name: 'Paper & Cardboard', type: 'RECYCLABLE_BUY', pricePerKg: 25, minWeightKg: 1, maxWeightKg: 500, active: true },
    ]);
    if (apiPath === '/api/reviews' && method === 'GET') return ok([]);
    if (apiPath === '/api/service-areas' && method === 'GET') return ok([]);
    if (apiPath === '/api/service-areas/check' && method === 'POST') {
      return ok({ serviceable: options.serviceable !== false, zone: { name: 'Synthetic Zone', basePickupCharge: 49 }, message: 'Synthetic serviceability result.' });
    }
    if (apiPath === '/api/customer/addresses' && method === 'GET') {
      return ok([...addresses].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || b.createdAt.localeCompare(a.createdAt)));
    }
    if (apiPath === '/api/customer/addresses' && method === 'POST') {
      const address = { ...body, id: `address-created-${addresses.length + 1}`, userId, name: 'Synthetic Customer', phone: '9000000001', city: 'Bengaluru', isDefault: Boolean(body?.isDefault), createdAt: new Date().toISOString() };
      if (address.isDefault) addresses = addresses.map((item) => ({ ...item, isDefault: false }));
      addresses.push(address);
      return ok(address, 201);
    }
    const addressMatch = apiPath.match(/^\/api\/customer\/addresses\/([^/]+)$/);
    if (addressMatch && method === 'PATCH') {
      const address = addresses.find((item) => item.id === decodeURIComponent(addressMatch[1]));
      if (!address) return denied(404);
      if (body?.isDefault === true) addresses = addresses.map((item) => ({ ...item, isDefault: item.id === address.id }));
      else Object.assign(address, body);
      return ok(address);
    }
    if (addressMatch && method === 'DELETE') {
      const priorLength = addresses.length;
      addresses = addresses.filter((item) => item.id !== decodeURIComponent(addressMatch[1]));
      return addresses.length === priorLength ? denied(404) : ok({ deleted: true });
    }
    if (apiPath === '/api/orders' && method === 'GET') return currentRole === 'GUEST' ? denied(401) : ok(orders);
    if (apiPath === '/api/orders' && method === 'POST') {
      const idempotencyKey = request.headers()['idempotency-key'];
      const prior = calls.find((call) => call.method === 'POST' && call.path === '/api/orders' && call !== calls.at(-1) && call.idempotencyKey === idempotencyKey);
      if (prior) return ok(orderById('order-created'));
      const order = syntheticOrder('order-created', customerId, { address: body?.address, status: 'BOOKING_RECEIVED', paymentStatus: 'PENDING' });
      orders = [order, ...orders];
      return ok(order, 201);
    }
    if (apiPath === '/api/payments/create' && method === 'POST') return ok({ key: 'rzp_test_synthetic', gatewayOrderId: 'rzp_synthetic_order', amount: 156, currency: 'INR', description: 'Synthetic payment' });
    if (apiPath === '/api/payments/verify' && method === 'POST') {
      const status = options.paymentStatus || 'CAPTURED';
      return status === 'FAILED' ? denied(400) : ok({ status });
    }
    if (/^\/api\/orders\/[^/]+\/cancel$/.test(apiPath) && method === 'POST') {
      const id = apiPath.split('/')[3];
      const order = orderById(id);
      if (!order) return denied(404);
      Object.assign(order, { status: 'CANCELLED', paymentStatus: order.paymentStatus === 'CAPTURED' ? 'REFUND_REQUIRED' : order.paymentStatus, cancellationReason: body?.cancellationReason || 'Synthetic cancellation' });
      return ok(order);
    }
    const orderMatch = apiPath.match(/^\/api\/orders\/([^/]+)$/);
    if (orderMatch && method === 'GET') {
      const id = decodeURIComponent(orderMatch[1]);
      if (currentRole === 'GUEST') return denied(401);
      const order = orderById(id);
      if (!order) return route.fulfill({ status: 404, json: { success: false, message: `Pickup order #${id} could not be found.` } });
      if (currentRole === 'CUSTOMER' && order.customerId !== customerId) return denied();
      if (currentRole === 'AGENT' && order.agentId !== agentId) return denied();
      return ok(order);
    }
    if (apiPath === '/api/complaints' && method === 'GET') return currentRole === 'GUEST' ? denied(401) : ok([]);
    if (apiPath === '/api/complaints' && method === 'POST') return currentRole === 'CUSTOMER' ? ok({ id: 'complaint-synthetic' }, 201) : denied();
    if (apiPath === '/api/agent/status' && method === 'GET') return ok({ status: 'AVAILABLE' });
    if (apiPath === '/api/agent/location' && method === 'POST') return ok({ id: 'location-synthetic' });

    unexpected.push(`unmocked API request: ${method} ${apiPath}`);
    await route.fulfill({ status: 599, json: { success: false, message: 'Unmocked API request blocked by test harness.' } });
  });

  return {
    calls,
    unexpected,
    get addresses() { return addresses; },
    get orders() { return orders; },
    async assertIsolated() {
      if (unexpected.length) throw new Error(unexpected.join('\n'));
    },
  };
}
