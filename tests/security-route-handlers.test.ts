import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getReports } from '../app/api/admin/reports/route';
import { GET as getAuditLogs } from '../app/api/admin/audit-logs/route';
import { POST as cancelOrder } from '../app/api/orders/[id]/cancel/route';
import {
  POST as createWasteCategory,
  PUT as updateWasteCategory,
} from '../app/api/waste-categories/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { broadcaster } from '../lib/realtime';

process.env.JWT_SECRET = 'security-route-test-secret-at-least-32-bytes';

type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

const database = db as any;

function token(
  role: Role,
  claims: Record<string, unknown> = {},
) {
  return signToken({
    userId: `${role.toLowerCase()}-user`,
    phone: '9999999999',
    name: role,
    role,
    ...claims,
  });
}

function request(
  url: string,
  options: {
    method?: string;
    token?: string;
    body?: Record<string, unknown>;
  } = {},
) {
  return new NextRequest(`http://localhost${url}`, {
    method: options.method || 'GET',
    headers: {
      ...(options.token ? { Cookie: `jio_token=${options.token}` } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
}

async function responseBody(response: Response) {
  return response.json() as Promise<any>;
}

test('reports route protects customer data and serves authorized admins', async () => {
  const orderDelegate = database.order;
  const originalFindMany = orderDelegate.findMany;
  let reportQueries = 0;

  orderDelegate.findMany = async () => {
    reportQueries += 1;
    return [{
      orderNumber: 'JIO-001',
      createdAt: new Date('2026-10-23T10:00:00.000Z'),
      status: 'BOOKING_RECEIVED',
      estimatedTotal: 100,
      finalAmount: 100,
      customer: { user: { name: 'Customer', phone: '9999999999' } },
      address: { area: 'JP Nagar' },
      agent: null,
      items: [],
    }];
  };

  try {
    const unauthenticatedResponse = await getReports(request('/api/admin/reports'));
    assert.equal(unauthenticatedResponse.status, 401);
    const unauthenticatedBody = await unauthenticatedResponse.text();
    assert.doesNotMatch(unauthenticatedBody, /Customer|9999999999|text\/csv|JIO-001/);

    const malformedResponse = await getReports(request('/api/admin/reports', {
      token: 'not-a-jwt',
    }));
    assert.equal(malformedResponse.status, 401);

    const signedToken = token('ADMIN');
    const tamperedToken = `${signedToken.slice(0, -1)}${signedToken.endsWith('a') ? 'b' : 'a'}`;
    assert.equal(
      (await getReports(request('/api/admin/reports', { token: tamperedToken }))).status,
      401,
    );
    assert.equal(
      (await getReports(request('/api/admin/reports', {
        token: signToken({
          userId: 'expired-admin',
          phone: '9999999999',
          name: 'Expired Admin',
          role: 'ADMIN',
        }, -1),
      }))).status,
      401,
    );
    const nonAdminResponse = await getReports(request('/api/admin/reports', {
      token: token('CUSTOMER'),
    }));
    assert.equal(nonAdminResponse.status, 403);
    const nonAdminBody = await nonAdminResponse.text();
    assert.doesNotMatch(nonAdminBody, /Customer|9999999999|text\/csv|JIO-001/);
    assert.equal(reportQueries, 0, 'unauthorized reports must not query customer data');

    const response = await getReports(request('/api/admin/reports', {
      token: token('ADMIN'),
    }));
    assert.equal(response.status, 200);
    assert.match(await response.text(), /JIO-001/);
    assert.equal(reportQueries, 1);
  } finally {
    orderDelegate.findMany = originalFindMany;
  }
});

test('audit logs route protects records and serves authorized admins', async () => {
  const auditDelegate = database.auditLog;
  const originalFindMany = auditDelegate.findMany;
  let auditQueries = 0;

  auditDelegate.findMany = async () => {
    auditQueries += 1;
    return [{ id: 'audit-1', action: 'ORDER_UPDATED' }];
  };

  try {
    assert.equal((await getAuditLogs(request('/api/admin/audit-logs'))).status, 401);
    assert.equal(
      (await getAuditLogs(request('/api/admin/audit-logs', {
        token: 'not-a-jwt',
      }))).status,
      401,
    );
    const signedToken = token('ADMIN');
    const tamperedToken = `${signedToken.slice(0, -1)}${signedToken.endsWith('a') ? 'b' : 'a'}`;
    assert.equal(
      (await getAuditLogs(request('/api/admin/audit-logs', {
        token: tamperedToken,
      }))).status,
      401,
    );
    assert.equal(
      (await getAuditLogs(request('/api/admin/audit-logs', {
        token: signToken({
          userId: 'expired-admin',
          phone: '9999999999',
          name: 'Expired Admin',
          role: 'ADMIN',
        }, -1),
      }))).status,
      401,
    );
    assert.equal(
      (await getAuditLogs(request('/api/admin/audit-logs', {
        token: token('CUSTOMER'),
      }))).status,
      403,
    );
    assert.equal(auditQueries, 0, 'unauthorized callers must not retrieve audit logs');

    const response = await getAuditLogs(request('/api/admin/audit-logs', {
      token: token('SUPER_ADMIN'),
    }));
    assert.equal(response.status, 200);
    assert.deepEqual((await responseBody(response)).data, [{ id: 'audit-1', action: 'ORDER_UPDATED' }]);
    assert.equal(auditQueries, 1);
  } finally {
    auditDelegate.findMany = originalFindMany;
  }
});

test('waste category mutations require admins and validate input before writes', async () => {
  const categoryDelegate = database.wasteCategory;
  const originalCreate = categoryDelegate.create;
  const originalFindUnique = categoryDelegate.findUnique;
  const originalUpdate = categoryDelegate.update;
  const auditDelegate = database.auditLog;
  const originalAuditCreate = auditDelegate.create;
  let creates = 0;
  let updates = 0;

  categoryDelegate.create = async ({ data }: any) => {
    creates += 1;
    return { id: 'category-1', ...data };
  };
  categoryDelegate.findUnique = async () => ({
    id: 'category-1',
    name: 'Paper',
    description: 'Paper waste',
    type: 'RECYCLABLE_BUY',
    pricePerKg: 14,
    active: true,
  });
  categoryDelegate.update = async ({ data }: any) => {
    updates += 1;
    return { id: 'category-1', name: 'Paper', pricePerKg: data.pricePerKg ?? 20, ...data };
  };
  auditDelegate.create = async () => ({ id: 'audit-category-1' });

  try {
    for (const method of ['POST', 'PUT']) {
      const handler = method === 'POST' ? createWasteCategory : updateWasteCategory;
      const url = '/api/waste-categories';
      assert.equal((await handler(request(url, { method }))).status, 401);
      assert.equal(
        (await handler(request(url, { method, token: token('CUSTOMER') }))).status,
        403,
      );
    }
    assert.equal(creates, 0);
    assert.equal(updates, 0);

    assert.equal(
      (await createWasteCategory(request('/api/waste-categories', {
        method: 'POST',
        token: token('ADMIN'),
        body: {
          name: 'Glass',
          description: 'Glass waste',
          pricePerKg: 4,
        },
      }))).status,
      201,
    );
    assert.equal(creates, 1);

    assert.equal(
      (await updateWasteCategory(request('/api/waste-categories', {
        method: 'PUT',
        token: token('ADMIN'),
        body: { id: 'category-1', pricePerKg: 18 },
      }))).status,
      200,
    );
    assert.equal(updates, 1);

    for (const body of [
      { name: '', description: 'Invalid' },
      { name: 'Invalid', description: 'Invalid', pricePerKg: -1 },
    ]) {
      assert.equal(
        (await createWasteCategory(request('/api/waste-categories', {
          method: 'POST',
          token: token('ADMIN'),
          body,
        }))).status,
        400,
      );
    }

    for (const body of [
      {},
      { id: 'category-1', pricePerKg: Number.NaN },
      { id: 'category-1', pricePerKg: '18' },
      { id: 'category-1', active: 'true' },
      { id: 'category-1', name: '   ' },
      { id: 'category-1', description: '   ' },
    ]) {
      assert.equal(
        (await updateWasteCategory(request('/api/waste-categories', {
          method: 'PUT',
          token: token('ADMIN'),
          body,
        }))).status,
        400,
      );
    }
    assert.equal(creates, 1, 'invalid category input must not create records');
    assert.equal(updates, 1, 'invalid category input must not update records');
  } finally {
    categoryDelegate.create = originalCreate;
    categoryDelegate.findUnique = originalFindUnique;
    categoryDelegate.update = originalUpdate;
    auditDelegate.create = originalAuditCreate;
  }
});

test('cancellation route rejects unauthorized and ineligible requests without side effects', async () => {
  const orderDelegate = database.order;
  const originalFindUnique = orderDelegate.findUnique;
  const originalTransaction = database.$transaction;
  let currentOrder: any = {
    id: 'order-1',
    orderNumber: 'JIO-001',
    customerId: 'customer-1',
    agentId: null,
    status: 'AGENT_ASSIGNED',
  };
  let transactions = 0;
  let histories = 0;
  let refunds = 0;
  let audits = 0;
  let broadcasts = 0;
  const unsubscribe = broadcaster.subscribe(() => {
    broadcasts += 1;
  });

  orderDelegate.findUnique = async () => ({ ...currentOrder });
  database.$transaction = async (callback: (tx: any) => unknown) => {
    transactions += 1;
    return callback({
      order: {
        updateMany: async ({ data }: any) => {
          if (currentOrder.status === 'CANCELLED') return { count: 0 };
          currentOrder = { ...currentOrder, ...data };
          return { count: 1 };
        },
        findUnique: async () => ({ ...currentOrder, customer: { user: { name: 'Customer' } } }),
      },
      orderStatusHistory: {
        create: async () => {
          histories += 1;
          return {};
        },
      },
      agent: { update: async () => ({}) },
      refundRequest: {
        findUnique: async () => null,
        create: async () => {
          refunds += 1;
          return {};
        },
      },
      payment: { findFirst: async () => null },
      auditLog: {
        create: async () => {
          audits += 1;
          return {};
        },
      },
    });
  };

  try {
    assert.equal(
      (await cancelOrder(request('/api/orders/order-1/cancel', {
        method: 'POST',
      }), { params: Promise.resolve({ id: 'order-1' }) })).status,
      401,
    );

    assert.equal(
      (await cancelOrder(request('/api/orders/order-1/cancel', {
        method: 'POST',
        token: token('CUSTOMER', { customerId: 'customer-2' }),
      }), { params: Promise.resolve({ id: 'order-1' }) })).status,
      404,
    );
    assert.equal(transactions, 0);
    assert.equal(refunds, 0);
    assert.equal(histories, 0);
    assert.equal(audits, 0);
    assert.equal(broadcasts, 0);

    currentOrder.status = 'PICKUP_COMPLETED';
    assert.equal(
      (await cancelOrder(request('/api/orders/order-1/cancel', {
        method: 'POST',
        token: token('CUSTOMER', { customerId: 'customer-1' }),
      }), { params: Promise.resolve({ id: 'order-1' }) })).status,
      404,
    );
    assert.equal(transactions, 0);

    currentOrder.status = 'AGENT_ASSIGNED';
    const first = await cancelOrder(request('/api/orders/order-1/cancel', {
      method: 'POST',
      token: token('CUSTOMER', { customerId: 'customer-1' }),
    }), { params: Promise.resolve({ id: 'order-1' }) });
    assert.equal(first.status, 200);
    const second = await cancelOrder(request('/api/orders/order-1/cancel', {
      method: 'POST',
      token: token('CUSTOMER', { customerId: 'customer-1' }),
    }), { params: Promise.resolve({ id: 'order-1' }) });
    assert.equal(second.status, 404);
    assert.equal(transactions, 1);
    assert.equal(histories, 1);
    assert.equal(refunds, 0);
    assert.equal(audits, 1);
    assert.equal(broadcasts, 1);
  } finally {
    unsubscribe();
    orderDelegate.findUnique = originalFindUnique;
    database.$transaction = originalTransaction;
  }
});
