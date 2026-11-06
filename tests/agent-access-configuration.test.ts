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

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  OTP_TEST_MODE: process.env.OTP_TEST_MODE,
  OTP_TEST_PHONE: process.env.OTP_TEST_PHONE,
  JWT_SECRET: process.env.JWT_SECRET,
};

(process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';
process.env.OTP_TEST_MODE = 'true';
process.env.OTP_TEST_PHONE = '7842259582,9353276638,7479895482';
process.env.JWT_SECRET = 'test-agent-access-config-secret-2026';

async function run() {
  const { NextRequest } = await import('next/server');
  const { isLocalOtpTestPhone, isValidLocalOtpTestCode } = await import('../lib/auth/localOtpTest');
  const { POST: sendOtp } = await import('../app/api/auth/send-otp/route');
  const { POST: agentLogin } = await import('../app/api/auth/agent-login/route');
  const { db } = await import('../lib/db');

  const database = db as any;

  console.log('--- 1. Testing isLocalOtpTestPhone & isValidLocalOtpTestCode ---');
  // Phone variants of 7842259582
  assert.equal(isLocalOtpTestPhone('7842259582'), true, '7842259582 bare 10 digits must match');
  assert.equal(isLocalOtpTestPhone('+917842259582'), true, '+917842259582 must match');
  assert.equal(isLocalOtpTestPhone('07842259582'), true, '07842259582 must match');

  // Other authorized agent numbers in comma-separated list
  assert.equal(isLocalOtpTestPhone('+919353276638'), true, '9353276638 in comma list must match');
  assert.equal(isLocalOtpTestPhone('+917479895482'), true, '7479895482 in comma list must match');

  // Unconfigured phone
  assert.equal(isLocalOtpTestPhone('+919999900000'), false, 'Unconfigured number must return false');

  // OTP codes
  assert.equal(isValidLocalOtpTestCode('123456'), true, '6-digit numeric OTP is valid');
  assert.equal(isValidLocalOtpTestCode('000000'), true, '6 zeros is valid');
  assert.equal(isValidLocalOtpTestCode('12345'), false, '5-digit code is invalid');
  assert.equal(isValidLocalOtpTestCode('1234567'), false, '7-digit code is invalid');
  assert.equal(isValidLocalOtpTestCode('abcdef'), false, 'Non-numeric code is invalid');

  // Production guard
  (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'production';
  assert.equal(isLocalOtpTestPhone('7842259582'), false, 'Must be disabled in production');
  (process.env as Record<string, string | undefined>)['NODE_ENV'] = 'development';

  console.log('--- 2. Testing POST /api/auth/send-otp for 7842259582 ---');
  const sendOtpReq = new NextRequest('http://localhost:3000/api/auth/send-otp', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' },
    body: JSON.stringify({ phone: '+917842259582' }),
  });
  const sendOtpRes = await sendOtp(sendOtpReq);
  assert.equal(sendOtpRes.status, 200, 'send-otp should return 200 for test agent phone 7842259582');
  const sendOtpBody = await sendOtpRes.json();
  assert.equal(sendOtpBody.success, true);
  assert.equal(sendOtpBody.data.cooldownSeconds, 0, 'Test mode should return cooldownSeconds: 0');

  console.log('--- 3. Testing POST /api/auth/agent-login for 7842259582 ---');
  const targetPhone = '+917842259582';
  let mockAgentUser: any = {
    id: 'agent-user-7842259582',
    phone: targetPhone,
    name: 'Dega Parthiv (Agent)',
    email: 'agent_7842259582@junkitout.in',
    role: 'AGENT',
    admin: null,
    agent: {
      id: 'agent-rec-7842259582',
      userId: 'agent-user-7842259582',
      status: 'AVAILABLE',
      vehicleType: 'Piaggio Ape Auto Loader (KA-05-JK-1024)',
      vehicleNumber: 'KA-05-JK-1024',
      serviceAreas: 'Indiranagar, Koramangala, Bengaluru',
    },
    customer: null,
  };

  const origFindFirst = database.user.findFirst;
  const origCreate = database.user.create;
  const origUpdate = database.user.update;

  database.user.findFirst = async () => mockAgentUser;
  database.user.create = async ({ data }: any) => ({ ...data, id: 'auto-provisioned-agent' });
  database.user.update = async ({ data }: any) => {
    mockAgentUser = { ...mockAgentUser, ...data };
    return mockAgentUser;
  };

  try {
    const loginReq = new NextRequest('http://localhost:3000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' },
      body: JSON.stringify({ phone: targetPhone, code: '123456' }),
    });

    const loginRes = await agentLogin(loginReq);
    assert.equal(loginRes.status, 200, 'Agent login must return 200 for 7842259582 with test OTP');
    const loginBody = await loginRes.json();
    assert.equal(loginBody.success, true);
    assert.equal(loginBody.data.user.phone, targetPhone);
    assert.equal(loginBody.data.user.agentId, 'agent-rec-7842259582');

    const cookieHeader = loginRes.headers.get('set-cookie');
    assert.ok(cookieHeader && cookieHeader.includes('jio_token='), 'Agent login must set jio_token cookie');

    // Test rejection of invalid test code
    const invalidOtpReq = new NextRequest('http://localhost:3000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' },
      body: JSON.stringify({ phone: targetPhone, code: '12' }),
    });
    const invalidOtpRes = await agentLogin(invalidOtpReq);
    assert.equal(invalidOtpRes.status, 400, 'Should reject non-6-digit test OTP code');

    // Test rejection of non-test phone (fails OTP verification)
    database.user.findFirst = async () => null;
    const nonTestReq = new NextRequest('http://localhost:3000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' },
      body: JSON.stringify({ phone: '+919999900000', code: '123456' }),
    });
    const nonTestRes = await agentLogin(nonTestReq);
    assert.equal(nonTestRes.status, 400, 'Non-test phone with unverified OTP must be rejected with 400');

    // Test rejection of test phone that is not in authorized agent whitelist
    process.env.OTP_TEST_PHONE = '7842259582,9353276638,7479895482,9876543210';
    const unauthorizedAgentReq = new NextRequest('http://localhost:3000/api/auth/agent-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', origin: 'http://localhost:3000', host: 'localhost:3000' },
      body: JSON.stringify({ phone: '+919876543210', code: '123456' }),
    });
    const unauthorizedAgentRes = await agentLogin(unauthorizedAgentReq);
    assert.equal(unauthorizedAgentRes.status, 403, 'Unauthorized non-agent number must be rejected with 403');

    console.log('✓ All Agent Access Configuration tests passed successfully!');
  } finally {
    database.user.findFirst = origFindFirst;
    database.user.create = origCreate;
    database.user.update = origUpdate;
    Module._resolveFilename = originalResolve;
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        delete (process.env as any)[key];
      } else {
        (process.env as any)[key] = val;
      }
    }
  }
}

run().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
