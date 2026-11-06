import assert from 'node:assert/strict';
import { test, describe, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { signToken } from '../lib/auth/jwt';
import { db } from '../lib/db';
import {
  GET as getSettings,
  PUT as putSettings,
  POST as postSettings,
  DELETE as deleteSettings,
  getAuthoritativeSettings,
  validateSettingsConfig,
  DEFAULT_SETTINGS,
} from '../app/api/admin/settings/route';

process.env.JWT_SECRET = 'admin-settings-test-secret-at-least-32-bytes!';

type Role = 'CUSTOMER' | 'AGENT' | 'ADMIN' | 'SUPER_ADMIN';

function makeToken(role: Role, extra: Record<string, unknown> = {}) {
  return signToken({
    userId: role === 'ADMIN' ? '2eb19ca3-db15-4848-affd-9fef5f190726' : `${role.toLowerCase()}-user-id`,
    phone: '8123767934',
    name: `${role} Test Admin`,
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

const TEST_USER_TAG = 'Test Isolation Runner';

afterAll(async () => {
  // Clean up any test records strictly isolated to this test run
  await db.auditLog.deleteMany({
    where: { userName: TEST_USER_TAG },
  });
});

describe('Settings API and Batched Persistence Suite', () => {
  test('Settings API: Authentication and Authorization enforcement', async () => {
    // 1. Unauthenticated GET returns 401
    const unauthRes = await getSettings(makeReq('/api/admin/settings', 'GET'));
    assert.equal(unauthRes.status, 401);

    // 2. Customer token GET returns 403
    const customerToken = makeToken('CUSTOMER');
    const customerRes = await getSettings(makeReq('/api/admin/settings', 'GET', customerToken));
    assert.equal(customerRes.status, 403);

    // 3. Admin token GET returns 200
    const adminToken = makeToken('ADMIN');
    const adminRes = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    assert.equal(adminRes.status, 200);
    const data = (await adminRes.json()).data;
    assert.ok(data.companyName);
    assert.ok(typeof data.dispatchSlaMinutes === 'number');

    // Verify secret keys are NEVER leaked in GET payload
    assert.equal(data.razorpayKeySecret, undefined);
    assert.equal(data.fast2smsApiKey, undefined);
    assert.equal(data.jwtSecret, undefined);
  });

  test('Settings API: Input Validation and Boundary checks using shared schema', async () => {
    const adminToken = makeToken('ADMIN');

    // Missing or short company name (< 3 chars)
    const invalidNameRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        companyName: 'AB',
      })
    );
    assert.equal(invalidNameRes.status, 400);
    const nameErr = await invalidNameRes.json();
    assert.ok(nameErr.error.message.includes('at least 3 characters'));

    // Invalid email format
    const invalidEmailRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        companyName: 'Valid Tech Ltd',
        supportEmail: 'not_an_email_address',
      })
    );
    assert.equal(invalidEmailRes.status, 400);
    const emailErr = await invalidEmailRes.json();
    assert.ok(emailErr.error.message.includes('valid support email'));

    // Invalid SLA (< 5 minutes)
    const lowSlaRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        companyName: 'Valid Tech Ltd',
        dispatchSlaMinutes: 2,
      })
    );
    assert.equal(lowSlaRes.status, 400);

    // Invalid SLA (> 300 minutes)
    const highSlaRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        companyName: 'Valid Tech Ltd',
        dispatchSlaMinutes: 500,
      })
    );
    assert.equal(highSlaRes.status, 400);

    // Invalid radius (< 1 km)
    const lowRadiusRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        companyName: 'Valid Tech Ltd',
        maxServiceRadiusKm: 0,
      })
    );
    assert.equal(lowRadiusRes.status, 400);
  });

  test('Settings API: HTTP Method restrictions (POST / DELETE prohibited)', async () => {
    const postRes = await postSettings();
    assert.equal(postRes.status, 405);
    assert.equal(postRes.headers.get('Allow'), 'GET, PUT');

    const deleteRes = await deleteSettings();
    assert.equal(deleteRes.status, 405);
    assert.equal(deleteRes.headers.get('Allow'), 'GET, PUT');
  });

  test('Settings API: Durable persistence and AuditLog event creation', async () => {
    const adminToken = makeToken('ADMIN');

    // Fetch current setting
    const getRes = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    assert.equal(getRes.status, 200);
    const baseline = (await getRes.json()).data;
    const initialSla = baseline.dispatchSlaMinutes;

    // Safe mutation in test database
    const targetSla = initialSla === 30 ? 35 : 30;
    const updateRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        ...baseline,
        dispatchSlaMinutes: targetSla,
      })
    );
    assert.equal(updateRes.status, 200);
    const updatedData = (await updateRes.json()).data;
    assert.equal(updatedData.dispatchSlaMinutes, targetSla);

    // Confirm subsequent GET retrieves the updated value directly from persistent storage
    const verifyGetRes = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    assert.equal(verifyGetRes.status, 200);
    const verifiedData = (await verifyGetRes.json()).data;
    assert.equal(verifiedData.dispatchSlaMinutes, targetSla);

    // Verify AuditLog record was created with exact diff
    const auditRecord = await db.auditLog.findFirst({
      where: { action: 'UPDATE_SYSTEM_SETTINGS' },
      orderBy: { timestamp: 'desc' },
    });
    assert.ok(auditRecord);
    assert.ok(auditRecord.newValue?.includes(`"dispatchSlaMinutes":${targetSla}`));

    // Clean restoration back to initial SLA
    const restoreRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        ...baseline,
        dispatchSlaMinutes: initialSla,
      })
    );
    assert.equal(restoreRes.status, 200);
    const restoredData = (await restoreRes.json()).data;
    assert.equal(restoredData.dispatchSlaMinutes, initialSla);
  });

  test('Settings API: Multiple consecutive updates return the newest valid configuration', async () => {
    const adminToken = makeToken('ADMIN');

    const getRes1 = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    const baseline = (await getRes1.json()).data;

    // First mutation: SLA 45
    const update1 = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        ...baseline,
        dispatchSlaMinutes: 45,
      })
    );
    assert.equal(update1.status, 200);

    // Second mutation: SLA 60 and companyName 'Junk It Out Green Labs'
    const update2 = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        ...baseline,
        dispatchSlaMinutes: 60,
        companyName: 'Junk It Out Green Labs',
      })
    );
    assert.equal(update2.status, 200);

    // Third check: GET must return second mutation
    const verifyGet = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
    assert.equal(verifyGet.status, 200);
    const verifyData = (await verifyGet.json()).data;
    assert.equal(verifyData.dispatchSlaMinutes, 60);
    assert.equal(verifyData.companyName, 'Junk It Out Green Labs');

    // Restore baseline
    const restoreRes = await putSettings(
      makeReq('/api/admin/settings', 'PUT', adminToken, {
        ...baseline,
      })
    );
    assert.equal(restoreRes.status, 200);
    const restoredData = (await restoreRes.json()).data;
    assert.equal(restoredData.dispatchSlaMinutes, baseline.dispatchSlaMinutes);
    assert.equal(restoredData.companyName, baseline.companyName);
  });

  test('Settings Persistence: Batched retrieval stops immediately when valid record is in first batch', async () => {
    // With batchSize 5, a valid newest record must be found in exactly 1 batch
    const result = await getAuthoritativeSettings(5);
    assert.equal(result.success, true);
    assert.ok(result.settings);
    assert.equal(result.batchesFetched, 1);
  });

  test('Settings Persistence: Cursor pagination fetches subsequent batch past multiple malformed records', async () => {
    const baseline = (await getAuthoritativeSettings()).settings!;

    // 1. Create a valid target record with SLA 99
    const validTargetConfig = {
      ...baseline,
      dispatchSlaMinutes: 99,
      companyName: 'Batch 2 Target Entity',
    };
    await db.auditLog.create({
      data: {
        userId: null,
        userName: TEST_USER_TAG,
        action: 'UPDATE_SYSTEM_SETTINGS',
        oldValue: null,
        newValue: JSON.stringify(validTargetConfig),
        timestamp: new Date(Date.now() + 1000), // Future-ish to be newer than previous
      },
    });

    // 2. Inject 6 malformed records newer than the valid target record
    const malformed = [
      '{ syntax error: unclosed json',
      'not a json string',
      '{"random": 123}', // Missing required fields
      '[]',
      'null',
      '{"companyName": "Incomplete", "dispatchSlaMinutes": "invalid"}',
    ];

    for (let i = 0; i < malformed.length; i++) {
      await db.auditLog.create({
        data: {
          userId: null,
          userName: TEST_USER_TAG,
          action: 'UPDATE_SYSTEM_SETTINGS',
          oldValue: null,
          newValue: malformed[i],
          timestamp: new Date(Date.now() + 2000 + i * 10),
        },
      });
    }

    try {
      // With batch size 3:
      // Batch 1 (3 items): all malformed
      // Batch 2 (3 items): all malformed
      // Batch 3 (1 item): validTargetConfig
      // Must fetch exactly 3 batches and return the valid target!
      const result = await getAuthoritativeSettings(3);
      assert.equal(result.success, true);
      assert.equal(result.settings?.dispatchSlaMinutes, 99);
      assert.equal(result.settings?.companyName, 'Batch 2 Target Entity');
      assert.equal(result.batchesFetched, 3);
    } finally {
      // Clean up test records
      await db.auditLog.deleteMany({
        where: { userName: TEST_USER_TAG },
      });
    }
  });

  test('Settings Persistence: Multiple records with identical timestamps order deterministically by ID desc', async () => {
    const baseline = (await getAuthoritativeSettings()).settings!;
    const sharedTimestamp = new Date('2026-06-15T12:00:00.000Z');

    // Create 3 records with the exact same millisecond timestamp
    const rec1 = await db.auditLog.create({
      data: {
        userId: null,
        userName: TEST_USER_TAG,
        action: 'UPDATE_SYSTEM_SETTINGS',
        oldValue: null,
        newValue: JSON.stringify({ ...baseline, dispatchSlaMinutes: 111 }),
        timestamp: sharedTimestamp,
      },
    });

    const rec2 = await db.auditLog.create({
      data: {
        userId: null,
        userName: TEST_USER_TAG,
        action: 'UPDATE_SYSTEM_SETTINGS',
        oldValue: null,
        newValue: JSON.stringify({ ...baseline, dispatchSlaMinutes: 222 }),
        timestamp: sharedTimestamp,
      },
    });

    try {
      // Query with batch size 1: Must tie-break by ID desc without throwing or looping
      const batch1 = await db.auditLog.findMany({
        where: { action: 'UPDATE_SYSTEM_SETTINGS', userName: TEST_USER_TAG },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        take: 1,
      });

      const batch2 = await db.auditLog.findMany({
        where: { action: 'UPDATE_SYSTEM_SETTINGS', userName: TEST_USER_TAG },
        orderBy: [{ timestamp: 'desc' }, { id: 'desc' }],
        cursor: { id: batch1[0].id },
        skip: 1,
        take: 1,
      });

      assert.equal(batch1.length, 1);
      assert.equal(batch2.length, 1);
      assert.notEqual(batch1[0].id, batch2[0].id);
      // Confirmed deterministic tie-break
      assert.ok(batch1[0].id > batch2[0].id);
    } finally {
      await db.auditLog.deleteMany({
        where: { userName: TEST_USER_TAG },
      });
    }
  });

  test('Settings Persistence: Explicit error returned when all historical records are invalid (no silent default fallback)', async () => {
    // Test the corruption guard using an isolated action or custom query check
    // We mock db.auditLog.findMany to return only malformed records
    const originalFindMany = db.auditLog.findMany;
    try {
      (db.auditLog as any).findMany = async () => [
        { id: 'corrupt-1', newValue: '{ broken json }', timestamp: new Date() },
        { id: 'corrupt-2', newValue: 'not-json', timestamp: new Date() },
        { id: 'corrupt-3', newValue: '{"dispatchSlaMinutes": "bad"}', timestamp: new Date() },
      ];

      const result = await getAuthoritativeSettings(10);
      assert.equal(result.success, false);
      assert.equal(result.error, 'CORRUPT_SETTINGS_HISTORY');
      assert.ok(result.message?.includes('All historical system settings records in the audit log are malformed'));

      // Also verify GET endpoint returns HTTP 500
      const adminToken = makeToken('ADMIN');
      const getRes = await getSettings(makeReq('/api/admin/settings', 'GET', adminToken));
      assert.equal(getRes.status, 500);
      const resBody = await getRes.json();
      assert.equal(resBody.error.code, 'CORRUPT_SETTINGS_HISTORY');
    } finally {
      (db.auditLog as any).findMany = originalFindMany;
    }
  });
});
