import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as sendOtpRoute } from '../app/api/auth/send-otp/route';
import { POST as whatsappWebhook } from '../app/api/webhooks/fast2sms/whatsapp/route';
import { POST as postAdminUsers } from '../app/api/admin/admin-users/route';
import { GET as getSyncSchema } from '../app/api/admin/sync-schema/route';
import { PATCH as patchSettlements } from '../app/api/admin/settlements/route';
import { validatePayload } from '../lib/auth/middleware';
import { signToken } from '../lib/auth/jwt';
import { _resetOtpRateLimitsForTesting } from '../lib/auth/otp';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'security-phase2c-test-secret-at-least-32-bytes';

function makeToken(role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN', claims: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-user-id`,
    phone: '9876543210',
    name: `${role} User`,
    role,
    tokenVersion: 1,
    ...claims,
  });
}

function makeReq(url: string, method: string, headers: Record<string, string> = {}, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

beforeEach(() => {
  (db.auditLog as any).create = async () => ({ id: 'mock-audit-id' });
});

describe('Additional Verification: Token Version Exact Equality', () => {
  let origUserFindUnique: any;
  let origAgentFindUnique: any;

  beforeEach(() => {
    origUserFindUnique = (db.user as any).findUnique;
    origAgentFindUnique = (db.agent as any).findUnique;
  });

  afterEach(() => {
    (db.user as any).findUnique = origUserFindUnique;
    (db.agent as any).findUnique = origAgentFindUnique;
  });

  const validExp = Math.floor(Date.now() / 1000) + 3600;

  test('User: accepts token when tokenVersion matches DB exactly', async () => {
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });
    const payload = {
      userId: 'user-1',
      phone: '9876543210',
      role: 'CUSTOMER' as const,
      tokenVersion: 1,
      exp: validExp,
    };
    const validated = await validatePayload(payload);
    assert.ok(validated !== null, 'Token with matching tokenVersion must be accepted');
    assert.equal(validated?.tokenVersion, 1);
  });

  test('User: rejects token when tokenVersion is lower (stale token)', async () => {
    (db.user as any).findUnique = async () => ({ tokenVersion: 2 });
    const payload = {
      userId: 'user-1',
      phone: '9876543210',
      role: 'CUSTOMER' as const,
      tokenVersion: 1, // Stale: DB is 2
      exp: validExp,
    };
    const validated = await validatePayload(payload);
    assert.equal(validated, null, 'Token with stale tokenVersion must be rejected');
  });

  test('User: rejects token when tokenVersion is higher (forged token)', async () => {
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });
    const payload = {
      userId: 'user-1',
      phone: '9876543210',
      role: 'CUSTOMER' as const,
      tokenVersion: 2, // Forged: DB is 1
      exp: validExp,
    };
    const validated = await validatePayload(payload);
    assert.equal(validated, null, 'Token with manipulated higher tokenVersion must be rejected');
  });

  test('Agent: accepts token when tokenVersion matches DB exactly', async () => {
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });
    (db.agent as any).findUnique = async () => ({ tokenVersion: 1 });
    const payload = {
      userId: 'agent-user-1',
      agentId: 'agent-1',
      phone: '9876543210',
      role: 'AGENT' as const,
      tokenVersion: 1,
      exp: validExp,
    };
    const validated = await validatePayload(payload);
    assert.ok(validated !== null, 'Agent token with matching tokenVersion must be accepted');
  });

  test('Agent: rejects token when agent tokenVersion differs from DB', async () => {
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });
    (db.agent as any).findUnique = async () => ({ tokenVersion: 3 });
    const payload = {
      userId: 'agent-user-1',
      agentId: 'agent-1',
      phone: '9876543210',
      role: 'AGENT' as const,
      tokenVersion: 1,
      exp: validExp,
    };
    const validated = await validatePayload(payload);
    assert.equal(validated, null, 'Agent token with mismatched tokenVersion must be rejected');
  });
});

describe('SEC-08: Prevent Customer Information Enumeration in send-otp', () => {
  const testPhone = '9876522222';
  let origTestMode: string | undefined;
  let origTestPhone: string | undefined;

  beforeEach(() => {
    origTestMode = process.env.OTP_TEST_MODE;
    origTestPhone = process.env.OTP_TEST_PHONE;
    process.env.OTP_TEST_MODE = 'true';
    process.env.OTP_TEST_PHONE = testPhone;
    _resetOtpRateLimitsForTesting();
  });

  afterEach(() => {
    process.env.OTP_TEST_MODE = origTestMode;
    process.env.OTP_TEST_PHONE = origTestPhone;
  });

  test('send-otp returns uniform response and does not disclose customer existence or name', async () => {
    const req = makeReq('/api/auth/send-otp', 'POST', {}, { phone: testPhone });
    const res = await sendOtpRoute(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.data, 'Response should contain data object');

    // SEC-08: isExisting and existingName MUST NOT be returned in unauthenticated response
    assert.equal(body.data.isExisting, undefined, 'isExisting must be removed to prevent enumeration');
    assert.equal(body.data.existingName, undefined, 'existingName must be removed to prevent enumeration');
    assert.ok(typeof body.data.message === 'string', 'Generic delivery message must be returned');
    assert.ok(typeof body.data.cooldownSeconds === 'number', 'Cooldown seconds must be returned');
  });
});

describe('SEC-09: Secure WhatsApp Webhook Authentication', () => {
  const originalEnv = process.env.NODE_ENV;
  const originalSecret = process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET;

  afterEach(() => {
    (process.env as any).NODE_ENV = originalEnv;
    process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET = originalSecret;
  });

  test('rejects webhook in production when webhook secret is missing (401)', async () => {
    (process.env as any).NODE_ENV = 'production';
    delete process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET;

    const req = makeReq('/api/webhooks/fast2sms/whatsapp', 'POST', {}, {
      request_id: 'req_123',
      status: 'delivered',
    });
    const res = await whatsappWebhook(req);
    assert.equal(res.status, 401, 'Production webhook without configured secret must return 401');
    const body = await res.json();
    assert.equal(body.success, false);
    const msg = body.error?.message || body.message;
    assert.match(msg, /not configured in production/i);
  });

  test('rejects unauthenticated request when secret is missing from headers (401)', async () => {
    process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET = 'correct_webhook_secret_key_12345';

    const req = makeReq('/api/webhooks/fast2sms/whatsapp', 'POST', {}, {
      request_id: 'req_123',
      status: 'delivered',
    });
    const res = await whatsappWebhook(req);
    assert.equal(res.status, 401, 'Missing secret header must return 401');
  });

  test('rejects request with invalid secret using constant-time comparison (401)', async () => {
    process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET = 'correct_webhook_secret_key_12345';

    const req = makeReq('/api/webhooks/fast2sms/whatsapp', 'POST', {
      'x-fast2sms-secret': 'wrong_secret_key_tampered_123',
    }, {
      request_id: 'req_123',
      status: 'delivered',
    });
    const res = await whatsappWebhook(req);
    assert.equal(res.status, 401, 'Invalid secret header must return 401');
  });

  test('does not query or modify database when webhook authentication fails', async () => {
    process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET = 'correct_webhook_secret_key_12345';

    let dbCalled = false;
    const origFind = (db.notification as any).findFirst;
    const origUpdate = (db.notification as any).update;
    (db.notification as any).findFirst = async () => { dbCalled = true; return null; };
    (db.notification as any).update = async () => { dbCalled = true; return null; };

    try {
      const req = makeReq('/api/webhooks/fast2sms/whatsapp', 'POST', {
        'x-fast2sms-secret': 'unauthorized_attempt',
      }, {
        request_id: 'req_123',
        status: 'delivered',
      });
      const res = await whatsappWebhook(req);
      assert.equal(res.status, 401);
      assert.equal(dbCalled, false, 'Database must not be queried for unauthenticated webhook calls');
    } finally {
      (db.notification as any).findFirst = origFind;
      (db.notification as any).update = origUpdate;
    }
  });

  test('accepts valid secret via header (or Authorization Bearer) and processes webhook', async () => {
    process.env.FAST2SMS_WHATSAPP_WEBHOOK_SECRET = 'correct_webhook_secret_key_12345';

    let findCalled = false;
    const origFind = (db.notification as any).findFirst;
    (db.notification as any).findFirst = async () => {
      findCalled = true;
      return null; // Return null so it acknowledges without mutating
    };

    try {
      const req = makeReq('/api/webhooks/fast2sms/whatsapp', 'POST', {
        authorization: 'Bearer correct_webhook_secret_key_12345',
      }, {
        request_id: 'req_123',
        status: 'delivered',
      });
      const res = await whatsappWebhook(req);
      assert.equal(res.status, 200, 'Valid secret should authenticate successfully');
      assert.equal(findCalled, true, 'Authenticated webhook proceeds to lookup');
    } finally {
      (db.notification as any).findFirst = origFind;
    }
  });
});

describe('SEC-10: Restrict Administrator Provisioning', () => {
  let origUserFindUnique: any;
  let origUserCreate: any;
  let origAdminFindUnique: any;
  let origAdminCreate: any;

  beforeEach(() => {
    origUserFindUnique = (db.user as any).findUnique;
    origUserCreate = (db.user as any).create;
    origAdminFindUnique = (db.admin as any).findUnique;
    origAdminCreate = (db.admin as any).create;
  });

  afterEach(() => {
    (db.user as any).findUnique = origUserFindUnique;
    (db.user as any).create = origUserCreate;
    (db.admin as any).findUnique = origAdminFindUnique;
    (db.admin as any).create = origAdminCreate;
  });

  test('rejects unauthenticated requests with 401', async () => {
    const req = makeReq('/api/admin/admin-users', 'POST', {}, {
      name: 'New Admin',
      phone: '9876543210',
    });
    const res = await postAdminUsers(req);
    assert.equal(res.status, 401);
  });

  test('rejects standard ADMIN from provisioning administrators with 403', async () => {
    const adminToken = makeToken('ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    const req = makeReq('/api/admin/admin-users', 'POST', {
      Cookie: `jio_token=${adminToken}`,
    }, {
      name: 'Escalated Admin',
      phone: '9876543210',
    });
    const res = await postAdminUsers(req);
    assert.equal(res.status, 403, 'Standard ADMIN must be forbidden from provisioning administrators (403)');
    const body = await res.json();
    assert.match(body.message, /Super Admin access required/i);
  });

  test('rejects modifying existing CUSTOMER account into administrator with 409', async () => {
    const superAdminToken = makeToken('SUPER_ADMIN');
    // First call checks caller's tokenVersion (SUPER_ADMIN)
    // Second call checks target user by phone
    (db.user as any).findUnique = async ({ where }: any) => {
      if (where.id) return { tokenVersion: 1 };
      if (where.phone === '9876500001') {
        return {
          id: 'existing-cust-id',
          phone: '9876500001',
          name: 'Existing Customer',
          role: 'CUSTOMER',
        };
      }
      return null;
    };

    const req = makeReq('/api/admin/admin-users', 'POST', {
      Cookie: `jio_token=${superAdminToken}`,
    }, {
      name: 'Customer Highjack Attempt',
      phone: '9876500001',
    });
    const res = await postAdminUsers(req);
    assert.equal(res.status, 409, 'Converting customer account to admin must return 409 Conflict');
    const body = await res.json();
    assert.match(body.message, /belongs to an existing customer or agent account/i);
  });

  test('rejects modifying existing AGENT account into administrator with 409', async () => {
    const superAdminToken = makeToken('SUPER_ADMIN');
    (db.user as any).findUnique = async ({ where }: any) => {
      if (where.id) return { tokenVersion: 1 };
      if (where.phone === '9876500002') {
        return {
          id: 'existing-agent-id',
          phone: '9876500002',
          name: 'Existing Agent',
          role: 'AGENT',
        };
      }
      return null;
    };

    const req = makeReq('/api/admin/admin-users', 'POST', {
      Cookie: `jio_token=${superAdminToken}`,
    }, {
      name: 'Agent Highjack Attempt',
      phone: '9876500002',
    });
    const res = await postAdminUsers(req);
    assert.equal(res.status, 409, 'Converting agent account to admin must return 409 Conflict');
  });

  test('SUPER_ADMIN can provision a new administrator', async () => {
    const superAdminToken = makeToken('SUPER_ADMIN');
    (db.user as any).findUnique = async ({ where }: any) => {
      if (where.id) return { tokenVersion: 1 };
      return null; // Target phone does not exist yet
    };
    (db.user as any).create = async ({ data }: any) => ({
      id: 'new-admin-uid',
      name: data.name,
      phone: data.phone,
      email: data.email,
      role: 'ADMIN',
    });
    (db.admin as any).findUnique = async () => null;
    (db.admin as any).create = async ({ data }: any) => ({
      id: 'new-admin-id',
      userId: data.userId,
      department: data.department,
      accessLevel: data.accessLevel,
    });

    const req = makeReq('/api/admin/admin-users', 'POST', {
      Cookie: `jio_token=${superAdminToken}`,
    }, {
      name: 'Valid New Admin',
      phone: '9876500003',
      department: 'Logistics',
    });
    const res = await postAdminUsers(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.data.department, 'Logistics');
  });
});

describe('SEC-11: Remove Runtime Database Schema Modifications', () => {
  let origQueryRaw: any;
  let origExecuteRaw: any;

  beforeEach(() => {
    origQueryRaw = (db as any).$queryRawUnsafe;
    origExecuteRaw = (db as any).$executeRawUnsafe;
  });

  afterEach(() => {
    (db as any).$queryRawUnsafe = origQueryRaw;
    (db as any).$executeRawUnsafe = origExecuteRaw;
  });

  test('GET /api/admin/sync-schema performs read-only inspection and NEVER executes DDL', async () => {
    const superAdminToken = makeToken('SUPER_ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    let ddlExecuted = false;
    (db as any).$executeRawUnsafe = async () => {
      ddlExecuted = true;
      throw new Error('DDL execution is strictly forbidden in runtime endpoints!');
    };

    (db as any).$queryRawUnsafe = async () => [{ is_nullable: 'NO' }];
    (db.complaint as any).count = async () => 10;
    (db.order as any).count = async () => 40;
    (db.customer as any).count = async () => 15;
    (db.user as any).count = async () => 25;

    const req = makeReq('/api/admin/sync-schema', 'GET', {
      Cookie: `jio_token=${superAdminToken}`,
    });
    const res = await getSyncSchema(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(ddlExecuted, false, 'Runtime DDL ($executeRawUnsafe) must never be executed');
    assert.equal(body.details.syncExecuted, false, 'syncExecuted must be false');
    assert.equal(body.details.migrationStrategy, 'PRISMA_MIGRATIONS');
    assert.equal(body.details.recordsPreserved.orders, 40);
  });
});

describe('SEC-12: Secure Settlement Status Transitions', () => {
  let origFindUnique: any;
  let origUpdate: any;
  let origSettlementFindUnique: any;
  let origTransaction: any;

  beforeEach(() => {
    origFindUnique = (db.user as any).findUnique;
    origUpdate = (db.settlement as any).update;
    origSettlementFindUnique = (db.settlement as any).findUnique;
    origTransaction = (db as any).$transaction;
    (db.settlement as any).findUnique = async () => null;
    (db as any).$transaction = async (fn: any) => fn(db);
  });

  afterEach(() => {
    (db.user as any).findUnique = origFindUnique;
    (db.settlement as any).update = origUpdate;
    (db.settlement as any).findUnique = origSettlementFindUnique;
    (db as any).$transaction = origTransaction;
  });

  test('rejects marking PAID when transaction reference is missing (400)', async () => {
    const adminToken = makeToken('ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    const req = makeReq('/api/admin/settlements', 'PATCH', {
      Cookie: `jio_token=${adminToken}`,
    }, {
      id: 'settlement-test-1',
      status: 'PAID',
    });
    const res = await patchSettlements(req);
    assert.equal(res.status, 400, 'PAID status without transaction reference must return 400');
    const body = await res.json();
    assert.match(body.message, /valid transaction reference or payout ID/i);
  });

  test('rejects marking PAID when transaction reference is invalid / malformed (400)', async () => {
    const adminToken = makeToken('ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    const req = makeReq('/api/admin/settlements', 'PATCH', {
      Cookie: `jio_token=${adminToken}`,
    }, {
      id: 'settlement-test-1',
      status: 'PAID',
      transactionReference: '??', // invalid characters and too short
    });
    const res = await patchSettlements(req);
    assert.equal(res.status, 400, 'PAID status with invalid transaction reference must return 400');
  });

  test('accepts marking PAID with a valid transaction reference (200)', async () => {
    const adminToken = makeToken('ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    let updatedData: any = null;
    (db.settlement as any).update = async ({ where, data }: any) => {
      updatedData = data;
      return {
        id: where.id,
        amount: 250,
        status: data.status,
        paidAt: data.paidAt,
      };
    };

    const req = makeReq('/api/admin/settlements', 'PATCH', {
      Cookie: `jio_token=${adminToken}`,
    }, {
      id: 'settlement-test-1',
      status: 'PAID',
      transactionReference: 'TXN_UPI_20261030_001',
    });
    const res = await patchSettlements(req);
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(updatedData.status, 'PAID');
    assert.ok(updatedData.paidAt instanceof Date, 'paidAt must be recorded');
  });

  test('allows marking APPROVED or READY_FOR_PAYOUT without transaction reference (200)', async () => {
    const adminToken = makeToken('ADMIN');
    (db.user as any).findUnique = async () => ({ tokenVersion: 1 });

    (db.settlement as any).update = async ({ where, data }: any) => ({
      id: where.id,
      amount: 250,
      status: data.status,
      approvedAt: data.approvedAt,
    });

    const req = makeReq('/api/admin/settlements', 'PATCH', {
      Cookie: `jio_token=${adminToken}`,
    }, {
      id: 'settlement-test-1',
      status: 'APPROVED',
    });
    const res = await patchSettlements(req);
    assert.equal(res.status, 200);
  });
});
