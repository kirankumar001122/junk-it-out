import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as adminLogin } from '../app/api/auth/admin-login/route';
import { GET as viewPhoto } from '../app/api/upload/view/route';
import { getClientIp } from '../lib/auth/requestSecurity';
import { sendOtp, verifyOtp, _resetOtpRateLimitsForTesting } from '../lib/auth/otp';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';
import path from 'path';
import fs from 'fs';

process.env.JWT_SECRET = 'security-phase2a-test-secret-at-least-32-bytes';

function createToken(role: 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN', claims: Record<string, unknown> = {}) {
  return signToken({
    userId: `${role.toLowerCase()}-user-id`,
    phone: '9876543210',
    name: `${role} User`,
    role,
    ...claims,
  });
}

describe('SEC-01: Super Admin Backdoor Removal', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
    process.env.OTP_TEST_MODE = 'true';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalEnv;
    }
    delete process.env.OTP_TEST_MODE;
    delete process.env.OTP_TEST_PHONE;
  });

  test('admin login rejects unauthorized phone numbers without creating or elevating accounts', async () => {
    process.env.OTP_TEST_PHONE = '7676272709';

    const userDelegate = db.user as any;
    const adminDelegate = db.admin as any;

    const originalFindFirst = userDelegate.findFirst;
    const originalCreate = userDelegate.create;
    const originalUpdate = userDelegate.update;
    const originalAdminUpsert = adminDelegate.upsert;
    const originalAdminFindUnique = adminDelegate.findUnique;

    let createCalled = false;
    let updateCalled = false;
    let upsertCalled = false;

    // Simulate database where this phone exists only as a regular CUSTOMER without an Admin record
    userDelegate.findFirst = async () => ({
      id: 'cust-id-1',
      phone: '+917676272709',
      role: 'CUSTOMER',
      admin: null,
      customer: { id: 'cust-rec-1' },
    });
    adminDelegate.findUnique = async () => null;
    userDelegate.create = async () => {
      createCalled = true;
      return {};
    };
    userDelegate.update = async () => {
      updateCalled = true;
      return {};
    };
    adminDelegate.upsert = async () => {
      upsertCalled = true;
      return {};
    };

    try {
      const req = new NextRequest('http://localhost:3000/api/auth/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: JSON.stringify({ phone: '+917676272709', code: '123456' }),
      });

      const res = await adminLogin(req);
      assert.equal(res.status, 403, 'Unauthorized phone number must receive 403 FORBIDDEN');
      const body = await res.json();
      assert.equal(body.success, false);
      assert.equal(createCalled, false, 'db.user.create must never be called to auto-create admin accounts');
      assert.equal(updateCalled, false, 'db.user.update must never be called to elevate permissions');
      assert.equal(upsertCalled, false, 'db.admin.upsert must never be called to auto-elevate admin records');
    } finally {
      userDelegate.findFirst = originalFindFirst;
      userDelegate.create = originalCreate;
      userDelegate.update = originalUpdate;
      adminDelegate.upsert = originalAdminUpsert;
      adminDelegate.findUnique = originalAdminFindUnique;
    }
  });

  test('admin login allows authorized admin whose admin record exists in database', async () => {
    process.env.OTP_TEST_PHONE = '9876500001';

    const userDelegate = db.user as any;
    const adminDelegate = db.admin as any;
    const originalFindFirst = userDelegate.findFirst;
    const originalAdminFindUnique = adminDelegate.findUnique;

    userDelegate.findFirst = async () => ({
      id: 'admin-user-id-1',
      phone: '+919876500001',
      name: 'Operations Manager',
      role: 'ADMIN',
      admin: { id: 'admin-rec-1', userId: 'admin-user-id-1', accessLevel: 'FULL' },
      customer: null,
    });
    adminDelegate.findUnique = async () => ({
      id: 'admin-rec-1',
      userId: 'admin-user-id-1',
      accessLevel: 'FULL',
    });

    try {
      const req = new NextRequest('http://localhost:3000/api/auth/admin-login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          origin: 'http://localhost:3000',
          host: 'localhost:3000',
        },
        body: JSON.stringify({ phone: '+919876500001', code: '123456' }),
      });

      const res = await adminLogin(req);
      assert.equal(res.status, 200, 'Legitimate existing admin must be permitted');
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.user.role, 'ADMIN');
      assert.equal(body.data.user.adminId, 'admin-rec-1');
      assert.ok(res.cookies.get('jio_token')?.value, 'Session cookie must be set');
    } finally {
      userDelegate.findFirst = originalFindFirst;
      adminDelegate.findUnique = originalAdminFindUnique;
    }
  });
});

describe('SEC-02: Secure OTP Rate Limiting & Client IP Resolution', () => {
  beforeEach(() => {
    _resetOtpRateLimitsForTesting();
    delete process.env.TRUST_PROXY;
    delete process.env.TRUSTED_PROXY_HEADER;
    delete process.env.VERCEL;
  });

  test('getClientIp ignores spoofed X-Forwarded-For headers when proxy is untrusted', () => {
    const req = new NextRequest('http://localhost:3000/api/auth/send-otp', {
      headers: {
        'x-forwarded-for': '203.0.113.195, 198.51.100.1',
        'x-real-ip': '203.0.113.195',
      },
    });

    const resolvedIp = getClientIp(req);
    assert.equal(
      resolvedIp,
      'untrusted-client',
      'Untrusted client-supplied X-Forwarded-For headers must not be trusted',
    );
  });

  test('getClientIp respects configured trusted proxy header', () => {
    process.env.TRUSTED_PROXY_HEADER = 'cf-connecting-ip';
    const req = new NextRequest('http://localhost:3000/api/auth/send-otp', {
      headers: {
        'cf-connecting-ip': '198.51.100.25',
        'x-forwarded-for': 'spoofed-attacker-ip',
      },
    });

    const resolvedIp = getClientIp(req);
    assert.equal(resolvedIp, '198.51.100.25');
  });

  test('verifyOtp limits failed attempts per normalized phone number regardless of IP rotation', async () => {
    const phone = '+91 99999 12345';
    // Configure Fast2SMS test credentials so request does not throw configuration error
    const origApiKey = process.env.FAST2SMS_API_KEY;
    const origOtpId = process.env.FAST2SMS_OTP_ID;
    process.env.FAST2SMS_API_KEY = 'test-key';
    process.env.FAST2SMS_OTP_ID = 'test-otp-id';
    const origFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ status_code: 400, message: ['Invalid OTP'] }), { status: 400 }) as any;

    try {
      // 5 failed verification attempts with 5 different rotating IPs
      for (let i = 1; i <= 5; i++) {
        const spoofedIp = `198.51.100.${i}`;
        const outcome = await verifyOtp(phone, '000000', spoofedIp);
        assert.equal(outcome.valid, false);
      }

      // 6th attempt with yet another new IP must be blocked by phone-level rate limit
      const outcome6 = await verifyOtp(phone, '000000', '198.51.100.99');
      assert.equal(outcome6.valid, false);
      assert.equal(
        outcome6.status,
        'rate_limited',
        '6th verification attempt must be blocked by phone rate limiting',
      );

      // Verify phone number normalization (+91 vs bare 10 digits share bucket)
      const outcomeNormalized = await verifyOtp('9999912345', '000000', '198.51.100.100');
      assert.equal(outcomeNormalized.status, 'rate_limited');
    } finally {
      global.fetch = origFetch;
      process.env.FAST2SMS_API_KEY = origApiKey;
      process.env.FAST2SMS_OTP_ID = origOtpId;
    }
  });
});

describe('SEC-03: Protect Private Customer Photographs', () => {
  const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
  const testFilename = `waste-photo-u_cust-owner-id-1730000000-abc1234.jpg`;
  const testFilePath = path.resolve(uploadsDir, testFilename);

  beforeEach(() => {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    // Write valid 12-byte JPEG header
    fs.writeFileSync(testFilePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]));
  });

  afterAll(() => {
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
  });

  test('unauthenticated request to /api/upload/view is rejected with 401', async () => {
    const req = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${testFilename}`);
    const res = await viewPhoto(req);
    assert.equal(res.status, 401, 'Unauthenticated access must be rejected with 401');
  });

  test('customer who does not own the photo is rejected with 403', async () => {
    const otherCustomerToken = createToken('CUSTOMER', {
      userId: 'cust-unrelated-id',
      customerId: 'cust-unrelated-record',
    });

    const orderDelegate = db.order as any;
    const complaintDelegate = db.complaint as any;
    const origOrderFind = orderDelegate.findFirst;
    const origComplaintFind = complaintDelegate.findFirst;

    // Simulate order belonging to another customer
    orderDelegate.findFirst = async () => ({
      id: 'order-123',
      customerId: 'cust-owner-record',
      customer: { userId: 'cust-owner-id' },
      agentId: 'agent-assigned-id',
    });
    complaintDelegate.findFirst = async () => null;

    try {
      const req = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${testFilename}`, {
        headers: {
          Cookie: `jio_token=${otherCustomerToken}`,
        },
      });

      const res = await viewPhoto(req);
      assert.equal(res.status, 403, 'Unrelated customer must receive 403 Forbidden');
    } finally {
      orderDelegate.findFirst = origOrderFind;
      complaintDelegate.findFirst = origComplaintFind;
    }
  });

  test('authorized customer owner can access photo and receives private cache headers', async () => {
    const ownerCustomerToken = createToken('CUSTOMER', {
      userId: 'cust-owner-id',
      customerId: 'cust-owner-record',
    });

    const req = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${testFilename}`, {
      headers: {
        Cookie: `jio_token=${ownerCustomerToken}`,
      },
    });

    const res = await viewPhoto(req);
    assert.equal(res.status, 200, 'Owner customer must receive 200 OK');
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl?.includes('private'), 'Cache-Control must be private');
    assert.ok(cacheControl?.includes('no-store'), 'Cache-Control must contain no-store');
    assert.ok(!cacheControl?.includes('public'), 'Cache-Control must NEVER contain public');
  });

  test('unassigned field agent is rejected with 403, while assigned agent is permitted', async () => {
    const assignedAgentToken = createToken('AGENT', {
      userId: 'agent-assigned-user',
      agentId: 'agent-assigned-record',
    });
    const unassignedAgentToken = createToken('AGENT', {
      userId: 'agent-unassigned-user',
      agentId: 'agent-unassigned-record',
    });

    const legacyFilename = `waste-photo-legacy-1730000000-xyz.jpg`;
    const legacyFilePath = path.resolve(uploadsDir, legacyFilename);
    fs.writeFileSync(legacyFilePath, Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]));

    const agentDelegate = db.agent as any;
    const orderDelegate = db.order as any;
    const complaintDelegate = db.complaint as any;
    const origAgentFind = agentDelegate.findUnique;
    const origOrderFind = orderDelegate.findFirst;
    const origComplaintFind = complaintDelegate.findFirst;

    // Mock agent findUnique so validatePayload in getAuthUser succeeds for both agents
    agentDelegate.findUnique = async ({ where }: any) => {
      if (where.id === 'agent-assigned-record' || where.id === 'agent-unassigned-record') {
        return { id: where.id, tokenVersion: 1 };
      }
      return null;
    };

    orderDelegate.findFirst = async () => ({
      id: 'order-123',
      customerId: 'cust-owner-record',
      customer: { userId: 'cust-owner-id' },
      agentId: 'agent-assigned-record',
    });
    complaintDelegate.findFirst = async () => null;

    try {
      // 1. Unassigned agent
      const unassignedReq = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${legacyFilename}`, {
        headers: { Cookie: `jio_token=${unassignedAgentToken}` },
      });
      const unassignedRes = await viewPhoto(unassignedReq);
      assert.equal(unassignedRes.status, 403, 'Unassigned agent must be rejected with 403');

      // 2. Assigned agent
      const assignedReq = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${legacyFilename}`, {
        headers: { Cookie: `jio_token=${assignedAgentToken}` },
      });
      const assignedRes = await viewPhoto(assignedReq);
      assert.equal(assignedRes.status, 200, 'Assigned agent must receive 200 OK');
    } finally {
      agentDelegate.findUnique = origAgentFind;
      orderDelegate.findFirst = origOrderFind;
      complaintDelegate.findFirst = origComplaintFind;
      if (fs.existsSync(legacyFilePath)) {
        fs.unlinkSync(legacyFilePath);
      }
    }
  });

  test('super admin can access photo across orders', async () => {
    const adminToken = createToken('SUPER_ADMIN', {
      userId: 'super-admin-id',
      adminId: 'admin-rec-id',
    });

    const req = new NextRequest(`http://localhost:3000/api/upload/view?url=/uploads/${testFilename}`, {
      headers: {
        Cookie: `jio_token=${adminToken}`,
      },
    });

    const res = await viewPhoto(req);
    assert.equal(res.status, 200, 'Super admin must receive 200 OK');
  });
});
