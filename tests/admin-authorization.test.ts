// @ts-nocheck
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { GET as getAuditLogs } from '../app/api/admin/audit-logs/route';
import { GET as getReports } from '../app/api/admin/reports/route';
import { POST as createWasteCategory } from '../app/api/waste-categories/route';
import { PUT as updateWasteCategory } from '../app/api/waste-categories/route';
import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';
import { getConfiguredBackendUrl, getApiUrl } from '../apps/admin/lib/api';

function request(path: string, role?: 'CUSTOMER' | 'ADMIN', body?: Record<string, unknown>, method = body ? 'POST' : 'GET') {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (role) {
    const token = signToken({ userId: `${role.toLowerCase()}-test`, phone: 'test-only', role });
    headers.set('Cookie', `jio_token=${token}`);
  }
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function run() {
  const auditDelegate = db.auditLog as any;
  const orderDelegate = db.order as any;
  const categoryDelegate = db.wasteCategory as any;
  const originals = {
    auditFindMany: auditDelegate.findMany,
    auditCreate: auditDelegate.create,
    orderFindMany: orderDelegate.findMany,
    categoryCreate: categoryDelegate.create,
    categoryFindUnique: categoryDelegate.findUnique,
    categoryUpdate: categoryDelegate.update,
  };
  let categoryWrites = 0;

  auditDelegate.findMany = async () => [];
  auditDelegate.create = async () => ({ id: 'audit-test' });
  orderDelegate.findMany = async () => [];
  categoryDelegate.create = async ({ data }: any) => {
    categoryWrites += 1;
    return { id: 'category-test', ...data };
  };
  categoryDelegate.findUnique = async () => ({ id: 'category-test', name: 'Test', pricePerKg: 5 });
  categoryDelegate.update = async ({ data }: any) => ({ id: 'category-test', name: 'Test', pricePerKg: 5, ...data });

  try {
    for (const handler of [getAuditLogs, getReports]) {
      assert.equal((await handler(request('/api/admin/resource'))).status, 401);
      assert.equal((await handler(request('/api/admin/resource', 'CUSTOMER'))).status, 403);
      assert.equal((await handler(request('/api/admin/resource', 'ADMIN'))).status, 200);
    }

    assert.equal((await createWasteCategory(request('/api/waste-categories', undefined, {
      name: 'test', description: 'test',
    }))).status, 401);
    assert.equal((await createWasteCategory(request('/api/waste-categories', 'CUSTOMER', {
      name: 'test', description: 'test',
    }))).status, 403);
    const created = await createWasteCategory(request('/api/waste-categories', 'ADMIN', {
      name: '  Test category  ', description: '  Local test  ', pricePerKg: 12,
    }));
    assert.equal(created.status, 201);
    assert.equal(categoryWrites, 1);

    assert.equal((await updateWasteCategory(request('/api/waste-categories', undefined, {
      id: 'category-test', pricePerKg: 7,
    }, 'PUT'))).status, 401);
    assert.equal((await updateWasteCategory(request('/api/waste-categories', 'CUSTOMER', {
      id: 'category-test', pricePerKg: 7,
    }, 'PUT'))).status, 403);
    const updated = await updateWasteCategory(request('/api/waste-categories', 'ADMIN', {
      id: 'category-test', pricePerKg: 7,
    }, 'PUT'));
    assert.equal(updated.status, 200);
    assert.equal((await updateWasteCategory(request('/api/waste-categories', 'ADMIN', {
      id: 'category-test', pricePerKg: -1,
    }, 'PUT'))).status, 400);

    const runtimeEnv = process.env as Record<string, string | undefined>;
    const originalNodeEnv = runtimeEnv.NODE_ENV;
    runtimeEnv.NODE_ENV = 'development';
    assert.throws(() => getConfiguredBackendUrl('https://example.invalid'), /localhost during development/);
    assert.equal(getConfiguredBackendUrl('http://localhost:3000'), 'http://localhost:3000');

    assert.throws(() => getApiUrl('https://example.invalid/api/test'), /localhost during development/);
    assert.throws(() => getApiUrl('HTTP://example.invalid/api/test'), /localhost during development/);
    assert.throws(() => getApiUrl('//example.invalid/api/test'), /Protocol-relative URLs are not allowed/);
    assert.equal(getApiUrl('http://localhost:3000/api/test'), 'http://localhost:3000/api/test');

    const originalApiBase = runtimeEnv.NEXT_PUBLIC_API_BASE_URL;
    runtimeEnv.NEXT_PUBLIC_API_BASE_URL = 'https://production.junkitout.in';
    assert.throws(() => getApiUrl('/api/test'), /localhost during development/);
    if (originalApiBase === undefined) delete runtimeEnv.NEXT_PUBLIC_API_BASE_URL;
    else runtimeEnv.NEXT_PUBLIC_API_BASE_URL = originalApiBase;
    if (originalNodeEnv === undefined) delete runtimeEnv.NODE_ENV;
    else runtimeEnv.NODE_ENV = originalNodeEnv;

    console.log('Admin route authorization and local backend configuration tests passed.');
  } finally {
    auditDelegate.findMany = originals.auditFindMany;
    auditDelegate.create = originals.auditCreate;
    orderDelegate.findMany = originals.orderFindMany;
    categoryDelegate.create = originals.categoryCreate;
    categoryDelegate.findUnique = originals.categoryFindUnique;
    categoryDelegate.update = originals.categoryUpdate;
    await db.$disconnect();
  }
}

void run();
