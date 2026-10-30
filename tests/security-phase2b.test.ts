import assert from 'node:assert/strict';
import { test, describe, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as submitComplaint } from '../app/api/complaints/route';
import { validatePayload, getAuthUser } from '../lib/auth/middleware';
import { POST as logout } from '../app/api/auth/logout/route';
import { POST as forceExitAgent } from '../app/api/admin/agents/force-exit/route';
import { GET as getMe } from '../app/api/auth/me/route';
import { POST as agentLogin } from '../app/api/auth/agent-login/route';
import { sendOtp, _resetOtpRateLimitsForTesting } from '../lib/auth/otp';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';

process.env.JWT_SECRET = 'security-phase2b-test-secret-at-least-32-bytes';

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

function makeReq(url: string, method: string, token?: string, body?: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe('SEC-04: Prevent Unauthenticated Customer Profile Mutation', () => {
  test('unauthenticated support enquiry writes to ContactEnquiry and never mutates User or Customer', async () => {
    const userDelegate = db.user as any;
    const customerDelegate = db.customer as any;
    const enquiryDelegate = (db as any).contactEnquiry;

    let userUpdated = false;
    let customerCreated = false;
    let enquiryCreated = false;
    let savedEnquiryData: any = null;

    const origUserUpdate = userDelegate.update;
    const origCustomerCreate = customerDelegate.create;
    const origEnquiryCreate = enquiryDelegate.create;

    userDelegate.update = async () => {
      userUpdated = true;
      throw new Error('User.update must not be called for unauthenticated enquiries');
    };
    customerDelegate.create = async () => {
      customerCreated = true;
      throw new Error('Customer.create must not be called for unauthenticated enquiries');
    };
    enquiryDelegate.create = async (args: any) => {
      enquiryCreated = true;
      savedEnquiryData = args.data;
      return { id: 'enquiry-1', ...args.data, createdAt: new Date() };
    };

    try {
      const req = makeReq('/api/complaints', 'POST', undefined, {
        name: 'Hacker Attempting Overwrite',
        phone: '9876543210',
        email: 'attacker@evil.com',
        subject: 'General Question',
        message: 'Can I change the customer name?',
      });

      const res = await submitComplaint(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(enquiryCreated, true);
      assert.equal(userUpdated, false);
      assert.equal(customerCreated, false);
      assert.equal(savedEnquiryData.name, 'Hacker Attempting Overwrite');
      assert.equal(savedEnquiryData.phone, '9876543210');
      assert.equal(savedEnquiryData.email, 'attacker@evil.com');
      assert.equal(savedEnquiryData.message, 'Can I change the customer name?');
      assert.equal(savedEnquiryData.status, 'OPEN');
    } finally {
      userDelegate.update = origUserUpdate;
      customerDelegate.create = origCustomerCreate;
      enquiryDelegate.create = origEnquiryCreate;
    }
  });

  test('unauthenticated request with orderId is rejected with 401 Unauthorized', async () => {
    const req = makeReq('/api/complaints', 'POST', undefined, {
      orderId: 'some-order-id',
      phone: '9876543210',
      message: 'Reporting issue on order',
    });

    const res = await submitComplaint(req);
    const json = await res.json();

    assert.equal(res.status, 401);
    assert.equal(json.success, false);
    assert.match(json.message, /Authentication required/i);
  });

  test('unauthenticated request without contact info is rejected with 400 Bad Request', async () => {
    const req = makeReq('/api/complaints', 'POST', undefined, {
      message: 'Anonymous note without contact info',
    });

    const res = await submitComplaint(req);
    const json = await res.json();

    assert.equal(res.status, 400);
    assert.equal(json.success, false);
    assert.match(json.message, /contact phone or email is required/i);
  });
});

describe('SEC-05: Session Revocation for All Roles', () => {
  test('validatePayload invalidates CUSTOMER session when user tokenVersion is incremented in DB', async () => {
    const customerPayload = {
      userId: 'customer-1',
      phone: '9876543210',
      role: 'CUSTOMER',
      customerId: 'cust-1',
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;

    // Database user has tokenVersion: 2 (revoked)
    const mockUserFinder = async (id: string) => ({ id, tokenVersion: 2 });
    const result = await validatePayload(customerPayload, undefined, mockUserFinder);
    assert.equal(result, null, 'Customer session must be invalidated when tokenVersion is stale');

    // Database user has tokenVersion: 1 (active)
    const activeMock = async (id: string) => ({ id, tokenVersion: 1 });
    const validResult = await validatePayload(customerPayload, undefined, activeMock);
    assert.notEqual(validResult, null, 'Customer session must be valid when tokenVersion matches');
  });

  test('validatePayload invalidates ADMIN session when user tokenVersion is incremented in DB', async () => {
    const adminPayload = {
      userId: 'admin-1',
      phone: '9876543210',
      role: 'ADMIN',
      adminId: 'adm-1',
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;

    const staleUserFinder = async (id: string) => ({ id, tokenVersion: 3 });
    const result = await validatePayload(adminPayload, undefined, staleUserFinder);
    assert.equal(result, null, 'Admin session must be invalidated when user tokenVersion is stale');
  });

  test('validatePayload invalidates SUPER_ADMIN session when user tokenVersion is incremented in DB', async () => {
    const superAdminPayload = {
      userId: 'super-admin-1',
      phone: '9876543210',
      role: 'SUPER_ADMIN',
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;

    const staleUserFinder = async (id: string) => ({ id, tokenVersion: 2 });
    const result = await validatePayload(superAdminPayload, undefined, staleUserFinder);
    assert.equal(result, null, 'Super Admin session must be invalidated when user tokenVersion is stale');
  });

  test('validatePayload invalidates AGENT session when user or agent tokenVersion is incremented in DB', async () => {
    const agentPayload = {
      userId: 'agent-user-1',
      phone: '9876543210',
      role: 'AGENT',
      agentId: 'agent-1',
      tokenVersion: 1,
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;

    // Stale user tokenVersion
    const staleUserFinder = async (id: string) => ({ id, tokenVersion: 2 });
    const activeAgentFinder = async (id: string) => ({ id, tokenVersion: 1 });
    const res1 = await validatePayload(agentPayload, activeAgentFinder, staleUserFinder);
    assert.equal(res1, null, 'Agent session must be invalidated when user tokenVersion is incremented');

    // Stale agent tokenVersion
    const activeUserFinder = async (id: string) => ({ id, tokenVersion: 1 });
    const staleAgentFinder = async (id: string) => ({ id, tokenVersion: 2 });
    const res2 = await validatePayload(agentPayload, staleAgentFinder, activeUserFinder);
    assert.equal(res2, null, 'Agent session must be invalidated when agent tokenVersion is incremented');
  });

  test('legacy token without tokenVersion claim is handled safely (defaults to 1)', async () => {
    const legacyPayload = {
      userId: 'user-legacy-1',
      phone: '9876543210',
      role: 'CUSTOMER',
      customerId: 'cust-1',
      // No tokenVersion in token payload
      exp: Math.floor(Date.now() / 1000) + 3600,
    } as any;

    const userFinder = async (id: string) => ({ id, tokenVersion: 1 });
    const result = await validatePayload(legacyPayload, undefined, userFinder);
    assert.notEqual(result, null, 'Legacy token without tokenVersion must remain valid until revoked');
  });

  test('logout increments user tokenVersion in database', async () => {
    const userDelegate = db.user as any;
    const origUpdate = userDelegate.update;
    const origFindUnique = userDelegate.findUnique;
    let incrementCalledOnUserId: string | null = null;

    userDelegate.findUnique = async (args: any) => ({
      id: args?.where?.id || 'logged-in-user-99',
      tokenVersion: 1,
    });

    userDelegate.update = async (args: any) => {
      incrementCalledOnUserId = args.where.id;
      return { id: args.where.id, tokenVersion: 2 };
    };

    try {
      const customerToken = makeToken('CUSTOMER', { userId: 'logged-in-user-99', customerId: 'c99' });
      const req = makeReq('/api/auth/logout', 'POST', customerToken);

      const res = await logout(req);
      assert.equal(res.status, 200);
      assert.equal(incrementCalledOnUserId, 'logged-in-user-99');
    } finally {
      userDelegate.update = origUpdate;
      userDelegate.findUnique = origFindUnique;
    }
  });

  test('administrative force-exit increments user tokenVersion for agent', async () => {
    const userDelegate = db.user as any;
    const agentDelegate = db.agent as any;
    const auditLogDelegate = db.auditLog as any;

    const origUserUpdate = userDelegate.update;
    const origUserFind = userDelegate.findUnique;
    const origAgentFind = agentDelegate.findUnique;
    const origAgentUpdate = agentDelegate.update;
    const origAuditCreate = auditLogDelegate.create;

    let userRevokedId: string | null = null;
    let agentRevokedId: string | null = null;

    userDelegate.findUnique = async (args: any) => ({
      id: args?.where?.id || 'admin-op-1',
      tokenVersion: 1,
    });
    userDelegate.update = async (args: any) => {
      userRevokedId = args.where.id;
      return { id: args.where.id, tokenVersion: 2 };
    };
    agentDelegate.findUnique = async () => ({
      id: 'agent-target-1',
      userId: 'user-target-1',
      status: 'AVAILABLE',
      tokenVersion: 1,
      user: { id: 'user-target-1', name: 'Field Agent', phone: '9876543210' },
    });
    agentDelegate.update = async (args: any) => {
      agentRevokedId = args.where.id;
      return { id: args.where.id, status: 'OFFLINE', tokenVersion: 2 };
    };
    auditLogDelegate.create = async () => ({ id: 'audit-1' });

    try {
      const adminToken = makeToken('ADMIN', { userId: 'admin-op-1', adminId: 'adm-op-1' });
      const req = makeReq('/api/admin/agents/force-exit', 'POST', adminToken, {
        agentId: 'agent-target-1',
      });

      const res = await forceExitAgent(req);
      assert.equal(res.status, 200);
      assert.equal(agentRevokedId, 'agent-target-1');
      assert.equal(userRevokedId, 'user-target-1');
    } finally {
      userDelegate.update = origUserUpdate;
      userDelegate.findUnique = origUserFind;
      agentDelegate.findUnique = origAgentFind;
      agentDelegate.update = origAgentUpdate;
      auditLogDelegate.create = origAuditCreate;
    }
  });
});

describe('SEC-06: Remove GET Endpoint Side Effects in GET /api/auth/me', () => {
  test('GET /api/auth/me does not create an Agent record when missing; returns agentProfileComplete: false', async () => {
    const userDelegate = db.user as any;
    const agentDelegate = db.agent as any;

    const origUserFind = userDelegate.findUnique;
    const origAgentCreate = agentDelegate.create;

    let agentCreateCalled = false;

    // Simulate an AGENT user whose Agent record is missing
    userDelegate.findUnique = async (args: any) => {
      if (args?.select?.tokenVersion) {
        return { tokenVersion: 1 };
      }
      return {
        id: 'agent-incomplete-user-id',
        phone: '9876543210',
        name: 'Agent Without Profile',
        email: null,
        role: 'AGENT',
        customer: null,
        agent: null,
        admin: null,
        addresses: [],
      };
    };

    agentDelegate.create = async () => {
      agentCreateCalled = true;
      throw new Error('GET /api/auth/me must NEVER create agent records');
    };

    try {
      const agentToken = makeToken('AGENT', {
        userId: 'agent-incomplete-user-id',
        agentId: 'agent-incomplete-profile',
      });
      const req = makeReq('/api/auth/me', 'GET', agentToken);

      const res = await getMe(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(agentCreateCalled, false, 'No Agent record should be created on GET /api/auth/me');
      assert.equal(json.data.agentProfileComplete, false);
      assert.equal(json.data.user.agent, null);
      assert.match(json.data.message || '', /Agent profile is incomplete/i);
    } finally {
      userDelegate.findUnique = origUserFind;
      agentDelegate.create = origAgentCreate;
    }
  });
});

describe('SEC-07: Remove Mass Order Reassignment on Agent Login', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
    process.env.OTP_TEST_MODE = 'true';
    process.env.OTP_TEST_PHONE = '9876543210';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      (process.env as Record<string, string | undefined>)['NODE_ENV'] = originalEnv;
    }
    delete process.env.OTP_TEST_MODE;
    delete process.env.OTP_TEST_PHONE;
  });

  test('POST /api/auth/agent-login does not reassign or update orders', async () => {
    const userDelegate = db.user as any;
    const orderDelegate = db.order as any;

    const origUserFind = userDelegate.findFirst;
    const origOrderUpdateMany = orderDelegate.updateMany;

    let orderUpdateManyCalled = false;

    userDelegate.findFirst = async () => ({
      id: 'agent-user-id-100',
      phone: '+919876543210',
      name: 'Field Agent 100',
      role: 'AGENT',
      tokenVersion: 1,
      agent: {
        id: 'agent-profile-100',
        userId: 'agent-user-id-100',
        status: 'AVAILABLE',
        tokenVersion: 1,
      },
    });

    orderDelegate.updateMany = async () => {
      orderUpdateManyCalled = true;
      throw new Error('Order.updateMany must not be called during agent login');
    };

    try {
      const req = makeReq('/api/auth/agent-login', 'POST', undefined, {
        phone: '9876543210',
        code: '123456',
      });

      const res = await agentLogin(req);
      const json = await res.json();

      assert.equal(res.status, 200);
      assert.equal(json.success, true);
      assert.equal(orderUpdateManyCalled, false, 'Agent login must never reassign pending orders');
      assert.equal(json.data.user.role, 'AGENT');
    } finally {
      userDelegate.findFirst = origUserFind;
      orderDelegate.updateMany = origOrderUpdateMany;
    }
  });
});

describe('Additional Verification: SEC-02 Phone Normalization Shared Rate-Limit Identity', () => {
  beforeEach(() => {
    _resetOtpRateLimitsForTesting();
  });

  test('+91 prefix and 10-digit Indian formats share the same rate-limit counter', async () => {
    const ip = '127.0.0.1';
    const testPhone = '9876511111';
    const origApiKey = process.env.FAST2SMS_API_KEY;
    const origOtpId = process.env.FAST2SMS_OTP_ID;
    process.env.FAST2SMS_API_KEY = 'test-api-key';
    process.env.FAST2SMS_OTP_ID = 'test-otp-id';
    const origFetch = global.fetch;
    global.fetch = async () => new Response(JSON.stringify({ status_code: 200, message: ['OTP sent'] }), { status: 200 }) as any;

    try {
      // 1. Send OTP to +919876511111
      const res1 = await sendOtp(`+91${testPhone}`, ip);
      assert.equal(res1.success, true);

      // 2. Immediate send to local 10-digit format 9876511111 should trigger cooldown
      const res2 = await sendOtp(testPhone, ip);
      assert.equal(res2.success, false);
      assert.equal(res2.status, 'cooldown');

      // 3. Immediate send to 0-prefixed format 09876511111 should also trigger cooldown
      const res3 = await sendOtp(`0${testPhone}`, ip);
      assert.equal(res3.success, false);
      assert.equal(res3.status, 'cooldown');
    } finally {
      global.fetch = origFetch;
      if (origApiKey !== undefined) {
        process.env.FAST2SMS_API_KEY = origApiKey;
      } else {
        delete process.env.FAST2SMS_API_KEY;
      }
      if (origOtpId !== undefined) {
        process.env.FAST2SMS_OTP_ID = origOtpId;
      } else {
        delete process.env.FAST2SMS_OTP_ID;
      }
    }
  });
});
