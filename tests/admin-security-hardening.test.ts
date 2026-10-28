import assert from 'node:assert/strict';
import { test } from 'vitest';
import { NextRequest } from 'next/server';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

// Admin route handlers
import { GET as getAdminUsers, POST as postAdminUsers } from '../app/api/admin/admin-users/route';
import { GET as getAgents, POST as postAgents, PUT as putAgents } from '../app/api/admin/agents/route';
import { POST as forceExitAgent } from '../app/api/admin/agents/force-exit/route';
import { GET as getAuditLogs } from '../app/api/admin/audit-logs/route';
import { GET as getComplaints, PUT as putComplaints } from '../app/api/admin/complaints/route';
import { GET as getCoupons, POST as postCoupons, PUT as putCoupons } from '../app/api/admin/coupons/route';
import { GET as getCustomers } from '../app/api/admin/customers/route';
import { GET as getNotifications } from '../app/api/admin/notifications/route';
import { GET as getPayments } from '../app/api/admin/payments/route';
import { POST as postRecovery } from '../app/api/admin/payments/recovery/route';
import { POST as postRefund } from '../app/api/admin/payments/refund/route';
import { GET as getPricing, PUT as putPricing } from '../app/api/admin/pricing/route';
import { GET as getReports } from '../app/api/admin/reports/route';
import { GET as getSettings, PUT as putSettings } from '../app/api/admin/settings/route';
import { GET as getSettlements, PATCH as patchSettlements } from '../app/api/admin/settlements/route';
import { GET as getStats } from '../app/api/admin/stats/route';
import { GET as getSyncSchema } from '../app/api/admin/sync-schema/route';
import { PUT as putServiceArea } from '../app/api/service-areas/route';
import { PUT as putWasteCategory, POST as postWasteCategory } from '../app/api/waste-categories/route';

process.env.JWT_SECRET = 'admin-security-test-secret';

type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

function makeToken(role: Role, extra: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-uid`,
    phone: '9876543210',
    name: `${role} Test User`,
    role,
    tokenVersion: 1,
    ...extra,
  });
}

function makeReq(url: string, method: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      ...(token ? { Cookie: `jio_token=${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

test('Admin Role Enforcement: Reject unauthenticated with 401 and non-admins with 403', async () => {
  const customerToken = makeToken('CUSTOMER', { customerId: 'cust-1' });
  const agentToken = makeToken('AGENT', { agentId: 'agent-1' });

  // Mock db.agent.findUnique for agent tokenVersion validation in validatePayload
  const origAgentFind = (db.agent as any).findUnique;
  (db.agent as any).findUnique = async () => ({ tokenVersion: 1 });

  const endpoints: Array<{ name: string; handler: (req: NextRequest) => Promise<Response>; method: string; url: string }> = [
    { name: 'GET /api/admin/admin-users', handler: getAdminUsers, method: 'GET', url: '/api/admin/admin-users' },
    { name: 'POST /api/admin/admin-users', handler: postAdminUsers, method: 'POST', url: '/api/admin/admin-users' },
    { name: 'GET /api/admin/agents', handler: getAgents, method: 'GET', url: '/api/admin/agents' },
    { name: 'POST /api/admin/agents', handler: postAgents, method: 'POST', url: '/api/admin/agents' },
    { name: 'PUT /api/admin/agents', handler: putAgents, method: 'PUT', url: '/api/admin/agents' },
    { name: 'POST /api/admin/agents/force-exit', handler: forceExitAgent, method: 'POST', url: '/api/admin/agents/force-exit' },
    { name: 'GET /api/admin/audit-logs', handler: getAuditLogs, method: 'GET', url: '/api/admin/audit-logs' },
    { name: 'GET /api/admin/complaints', handler: getComplaints, method: 'GET', url: '/api/admin/complaints' },
    { name: 'PUT /api/admin/complaints', handler: putComplaints, method: 'PUT', url: '/api/admin/complaints' },
    { name: 'GET /api/admin/coupons', handler: getCoupons, method: 'GET', url: '/api/admin/coupons' },
    { name: 'POST /api/admin/coupons', handler: postCoupons, method: 'POST', url: '/api/admin/coupons' },
    { name: 'PUT /api/admin/coupons', handler: putCoupons, method: 'PUT', url: '/api/admin/coupons' },
    { name: 'GET /api/admin/customers', handler: getCustomers, method: 'GET', url: '/api/admin/customers' },
    { name: 'GET /api/admin/notifications', handler: getNotifications, method: 'GET', url: '/api/admin/notifications' },
    { name: 'GET /api/admin/payments', handler: getPayments, method: 'GET', url: '/api/admin/payments' },
    { name: 'POST /api/admin/payments/recovery', handler: postRecovery, method: 'POST', url: '/api/admin/payments/recovery' },
    { name: 'POST /api/admin/payments/refund', handler: postRefund, method: 'POST', url: '/api/admin/payments/refund' },
    { name: 'GET /api/admin/pricing', handler: getPricing, method: 'GET', url: '/api/admin/pricing' },
    { name: 'PUT /api/admin/pricing', handler: putPricing, method: 'PUT', url: '/api/admin/pricing' },
    { name: 'GET /api/admin/reports', handler: getReports, method: 'GET', url: '/api/admin/reports' },
    { name: 'GET /api/admin/settings', handler: getSettings, method: 'GET', url: '/api/admin/settings' },
    { name: 'PUT /api/admin/settings', handler: putSettings, method: 'PUT', url: '/api/admin/settings' },
    { name: 'GET /api/admin/settlements', handler: getSettlements, method: 'GET', url: '/api/admin/settlements' },
    { name: 'PATCH /api/admin/settlements', handler: patchSettlements, method: 'PATCH', url: '/api/admin/settlements' },
    { name: 'GET /api/admin/stats', handler: getStats, method: 'GET', url: '/api/admin/stats' },
    { name: 'GET /api/admin/sync-schema', handler: getSyncSchema, method: 'GET', url: '/api/admin/sync-schema' },
    { name: 'PUT /api/service-areas', handler: putServiceArea, method: 'PUT', url: '/api/service-areas' },
    { name: 'PUT /api/waste-categories', handler: putWasteCategory, method: 'PUT', url: '/api/waste-categories' },
    { name: 'POST /api/waste-categories', handler: postWasteCategory, method: 'POST', url: '/api/waste-categories' },
  ];

  try {
    for (const ep of endpoints) {
      // 1. Unauthenticated -> 401
      const unauthRes = await ep.handler(makeReq(ep.url, ep.method));
      assert.equal(
        unauthRes.status,
        401,
        `${ep.name}: Unauthenticated request must return 401, got ${unauthRes.status}`
      );

      // 2. Customer token -> 403
      const custRes = await ep.handler(makeReq(ep.url, ep.method, customerToken));
      assert.equal(
        custRes.status,
        403,
        `${ep.name}: Customer role must be forbidden with 403, got ${custRes.status}`
      );

      // 3. Agent token -> 403
      const agentRes = await ep.handler(makeReq(ep.url, ep.method, agentToken));
      assert.equal(
        agentRes.status,
        403,
        `${ep.name}: Agent role must be forbidden with 403, got ${agentRes.status}`
      );
    }
  } finally {
    (db.agent as any).findUnique = origAgentFind;
  }
});

test('Super Admin Privilege Check: sync-schema strictly forbids regular ADMIN (403) and allows SUPER_ADMIN (200)', async () => {
  const adminToken = makeToken('ADMIN');
  const superAdminToken = makeToken('SUPER_ADMIN');

  // ADMIN -> 403
  const adminRes = await getSyncSchema(makeReq('/api/admin/sync-schema', 'GET', adminToken));
  assert.equal(adminRes.status, 403, 'Regular ADMIN must be forbidden from running schema DDL sync (403)');

  // SUPER_ADMIN -> 200 (Mock DB queries)
  const origQueryRaw = (db as any).$queryRawUnsafe;
  const origExecuteRaw = (db as any).$executeRawUnsafe;
  const origComplaintCount = (db.complaint as any).count;
  const origOrderCount = (db.order as any).count;
  const origCustomerCount = (db.customer as any).count;
  const origUserCount = (db.user as any).count;
  const origAuditCreate = (db.auditLog as any).create;

  (db as any).$queryRawUnsafe = async () => [{ is_nullable: 'YES' }];
  (db as any).$executeRawUnsafe = async () => 1;
  (db.complaint as any).count = async () => 5;
  (db.order as any).count = async () => 38;
  (db.customer as any).count = async () => 12;
  (db.user as any).count = async () => 20;
  (db.auditLog as any).create = async () => ({ id: 'audit-1' });

  try {
    const superAdminRes = await getSyncSchema(makeReq('/api/admin/sync-schema', 'GET', superAdminToken));
    assert.equal(superAdminRes.status, 200, 'SUPER_ADMIN is authorized to run schema sync (200)');
    const body = await superAdminRes.json();
    assert.equal(body.success, true);
    assert.equal(body.details.recordsPreserved.orders, 38);
  } finally {
    (db as any).$queryRawUnsafe = origQueryRaw;
    (db as any).$executeRawUnsafe = origExecuteRaw;
    (db.complaint as any).count = origComplaintCount;
    (db.order as any).count = origOrderCount;
    (db.customer as any).count = origCustomerCount;
    (db.user as any).count = origUserCount;
    (db.auditLog as any).create = origAuditCreate;
  }
});

test('Input Validation & Sanitization: Rejects invalid payloads with 400', async () => {
  const adminToken = makeToken('ADMIN');

  // 1. Invalid phone number for admin user
  const badPhoneRes = await postAdminUsers(makeReq('/api/admin/admin-users', 'POST', adminToken, {
    name: 'Test Admin',
    phone: '123', // invalid length
  }));
  assert.equal(badPhoneRes.status, 400, 'Invalid phone number must be rejected with 400');

  // 2. Invalid pricing numeric values
  const badPricingRes = await putPricing(makeReq('/api/admin/pricing', 'PUT', adminToken, {
    basePickupCharge: -10, // negative price
  }));
  assert.equal(badPricingRes.status, 400, 'Negative pricing value must be rejected with 400');

  // 3. Invalid coupon code
  const badCouponRes = await postCoupons(makeReq('/api/admin/coupons', 'POST', adminToken, {
    code: 'A', // too short
    discountValue: 50,
  }));
  assert.equal(badCouponRes.status, 400, 'Invalid coupon code must be rejected with 400');

  // 4. Invalid complaint status
  const badComplaintRes = await putComplaints(makeReq('/api/admin/complaints', 'PUT', adminToken, {
    id: 'complaint-1',
    status: 'NON_EXISTENT_STATUS',
  }));
  assert.equal(badComplaintRes.status, 400, 'Invalid complaint status must be rejected with 400');
});

test('Destructive Action Audit Logging: Force-exit agent records immutable audit log', async () => {
  const adminToken = makeToken('ADMIN');
  let auditCreated = false;
  let auditPayload: any = null;

  const origAgentFind = (db.agent as any).findUnique;
  const origAgentUpdate = (db.agent as any).update;
  const origAuditCreate = (db.auditLog as any).create;

  (db.agent as any).findUnique = async () => ({
    id: 'agent-101',
    status: 'AVAILABLE',
    tokenVersion: 1,
    user: { name: 'Field Agent Test', phone: '9876543210' },
  });
  (db.agent as any).update = async () => ({ id: 'agent-101', status: 'OFFLINE' });
  (db.auditLog as any).create = async (args: any) => {
    auditCreated = true;
    auditPayload = args.data;
    return { id: 'audit-1' };
  };

  try {
    const res = await forceExitAgent(makeReq('/api/admin/agents/force-exit', 'POST', adminToken, {
      agentId: 'agent-101',
    }));
    assert.equal(res.status, 200, 'Force exit agent succeeded');
    assert.equal(auditCreated, true, 'Audit log was created');
    assert.equal(auditPayload.action, 'AGENT_FORCE_EXIT', 'Audit action recorded as AGENT_FORCE_EXIT');
  } finally {
    (db.agent as any).findUnique = origAgentFind;
    (db.agent as any).update = origAgentUpdate;
    (db.auditLog as any).create = origAuditCreate;
  }
});

