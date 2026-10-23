import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

// Hook Module._resolveFilename to provide 'server-only' stub during standalone test execution
const require = createRequire(import.meta.url);
const Module = require('node:module');
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function (request: string, parent: any, isMain: boolean, options: any) {
  if (request === 'server-only') {
    return require.resolve('../package.json');
  }
  return originalResolve.call(this, request, parent, isMain, options);
};

(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5433/parthiv_db';
process.env.DIRECT_URL = 'postgresql://test:test@127.0.0.1:5433/parthiv_db';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_PHONE = '7676272709';

async function run() {
  const { NextRequest } = await import('next/server');
  const { POST: adminLogin } = await import('../app/api/auth/admin-login/route');
  const { db } = await import('../lib/db');

  const userDelegate = db.user as any;
  const adminDelegate = db.admin as any;

  const originalFindFirst = userDelegate.findFirst;
  const originalFindUnique = userDelegate.findUnique;
  const originalUpdate = userDelegate.update;
  const originalUpdateMany = userDelegate.updateMany;
  const originalAdminFindUnique = adminDelegate.findUnique;

  const mockUsers = new Map<string, any>([
    [
      '7676272709',
      {
        id: 'owner-user-id',
        phone: '+917676272709',
        name: 'Owner Admin',
        email: 'admin_7676272709@junkitout.in',
        role: 'SUPER_ADMIN',
        admin: { id: 'admin-rec-1', userId: 'owner-user-id', accessLevel: 'SUPER_ADMIN' },
      },
    ],
    [
      '9876543210',
      {
        id: 'secondary-admin-id',
        phone: '+919876543210',
        name: 'Secondary Admin',
        email: 'secondary@junkitout.in',
        role: 'ADMIN',
        admin: { id: 'admin-rec-2', userId: 'secondary-admin-id', accessLevel: 'FULL' },
      },
    ],
  ]);

  const updateManyCalls: any[] = [];

  userDelegate.findFirst = async ({ where }: any) => {
    const phones: string[] = where?.OR?.[0]?.phone?.in || [];
    for (const [phone, user] of mockUsers.entries()) {
      if (phones.some((p) => p.includes(phone))) {
        return { ...user };
      }
    }
    return null;
  };

  userDelegate.findUnique = async ({ where }: any) => {
    for (const user of mockUsers.values()) {
      if (user.id === where.id || user.phone === where.phone) {
        return { ...user };
      }
    }
    return null;
  };

  adminDelegate.findUnique = async ({ where }: any) => {
    for (const user of mockUsers.values()) {
      if (user.admin?.userId === where.userId || user.id === where.userId) {
        return { ...user.admin };
      }
    }
    return null;
  };

  userDelegate.update = async ({ where, data }: any) => {
    for (const [phone, user] of mockUsers.entries()) {
      if (user.id === where.id) {
        const updated = { ...user, ...data };
        mockUsers.set(phone, updated);
        return updated;
      }
    }
    return null;
  };

  userDelegate.updateMany = async (args: any) => {
    updateManyCalls.push(args);
    return { count: 0 };
  };

  try {
    // 1. Simulate owner login (7676272709)
    const ownerReq = new NextRequest('http://localhost/api/auth/admin-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ phone: '+917676272709', code: '123456' }),
    });

    const ownerRes = await adminLogin(ownerReq);
    assert.equal(ownerRes.status, 200, 'owner login should succeed');

    // 2. Assert NO updateMany demotion was executed
    assert.equal(
      updateManyCalls.length,
      0,
      'db.user.updateMany must not be executed during owner login to bulk demote other admins',
    );

    // 3. Assert secondary admin was NOT demoted
    const secondaryAdmin = mockUsers.get('9876543210');
    assert.equal(
      secondaryAdmin.role,
      'ADMIN',
      'secondary admin role must remain ADMIN after owner logs in',
    );

    // 4. Test secondary admin login with valid OTP test mode
    process.env.OTP_TEST_PHONE = '9876543210';
    const secondaryReq = new NextRequest('http://localhost/api/auth/admin-login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
        host: 'localhost:3000',
      },
      body: JSON.stringify({ phone: '+919876543210', code: '123456' }),
    });

    const secondaryRes = await adminLogin(secondaryReq);
    assert.equal(secondaryRes.status, 200, 'secondary admin login should succeed');
    assert.equal(
      updateManyCalls.length,
      0,
      'no demotion queries should be executed on any admin login',
    );

    console.log('Admin login bulk demotion regression test passed.');
  } finally {
    userDelegate.findFirst = originalFindFirst;
    userDelegate.findUnique = originalFindUnique;
    userDelegate.update = originalUpdate;
    userDelegate.updateMany = originalUpdateMany;
    adminDelegate.findUnique = originalAdminFindUnique;
    Module._resolveFilename = originalResolve;
    await db.$disconnect();
  }
}

void run();
