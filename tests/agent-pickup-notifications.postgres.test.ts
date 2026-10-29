import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { basename } from 'node:path';
import {
  deliverAgentPickupNotifications,
  getAgentPickupNotificationId,
  persistAgentPickupNotificationsOnce,
  type AgentPickupOffer,
} from '../lib/services/agentBookingNotification';

const EXPECTED_HOST = '127.0.0.1';
const EXPECTED_PORT = '5433';
const EXPECTED_DATABASE = 'junkitout_agent_test';
const EXPECTED_ROLE = 'junkitout_test';
const EXPECTED_CONTAINER_PORT = 5432;

class SafeTestConfigurationError extends Error {}

function normalizeServerAddress(address: string | null | undefined) {
  if (!address) return null;
  return address.replace(/\/32$/, '');
}

function isLoopbackOrPrivateDockerAddress(address: string | null | undefined): boolean {
  if (!address) return false;
  if (address === EXPECTED_HOST) return true;

  const parts = address.split('.').map(Number);
  if (parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255)) {
    // RFC 1918 172.16.0.0/12 (172.16.0.0 - 172.31.255.255) standard Docker bridge network range
    return parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
  }
  return false;
}

async function createPrismaClient(databaseUrl: string) {
  const originalExistsSync = fs.existsSync;
  fs.existsSync = ((path) => {
    if (typeof path === 'string' && ['.env', '.env.local'].includes(basename(path).toLowerCase())) {
      return false;
    }
    return originalExistsSync(path);
  }) as typeof fs.existsSync;

  try {
    const { PrismaClient } = await import('@prisma/client');
    const options = {
      datasources: { db: { url: databaseUrl } },
      __internal: {
        configOverride: (config: Record<string, unknown>) => ({
          ...config,
          relativeEnvPaths: { rootEnvPath: null, schemaEnvPath: null },
        }),
      },
    } as unknown as ConstructorParameters<typeof PrismaClient>[0];

    return new PrismaClient(options);
  } finally {
    fs.existsSync = originalExistsSync;
  }
}

function getVerifiedDatabaseUrl() {
  const rawUrl = process.env.DATABASE_URL;
  if (!rawUrl) {
    throw new SafeTestConfigurationError(
      'Set process-scoped DATABASE_URL for the isolated PostgreSQL test database.',
    );
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new SafeTestConfigurationError(
      'DATABASE_URL is not a valid PostgreSQL URL; refusing database operations.',
    );
  }

  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== EXPECTED_HOST ||
    url.port !== EXPECTED_PORT ||
    url.pathname !== `/${EXPECTED_DATABASE}` ||
    decodeURIComponent(url.username) !== EXPECTED_ROLE ||
    !url.password
  ) {
    throw new SafeTestConfigurationError(
      'Refusing database operations: DATABASE_URL must target 127.0.0.1:5433/junkitout_agent_test as junkitout_test.',
    );
  }

  return rawUrl;
}

async function run() {
  const databaseUrl = getVerifiedDatabaseUrl();
  const prisma = await createPrismaClient(databaseUrl);
  const testId = randomUUID();
  const customerUserId = `pg-agent-test-customer-${testId}`;
  const agentUserId = `pg-agent-test-agent-${testId}`;
  const customerId = `pg-agent-test-customer-record-${testId}`;
  const addressId = `pg-agent-test-address-${testId}`;
  const orderId = `pg-agent-test-order-${testId}`;
  const orderNumber = `JIO-PGTEST-${testId}`;
  const notificationId = getAgentPickupNotificationId(orderId, `agent-${testId}`);
  let fixturesCreated = false;

  try {
    const [identity] = await prisma.$queryRaw<Array<{
      database: string;
      role: string;
      serverAddress: string | null;
      serverPort: number | null;
    }>>`
      SELECT
        current_database() AS database,
        current_user AS role,
        inet_server_addr()::text AS "serverAddress",
        inet_server_port() AS "serverPort"
    `;

    const normalizedServerAddress = normalizeServerAddress(identity?.serverAddress);
    const validServerAddress = isLoopbackOrPrivateDockerAddress(normalizedServerAddress);
    const validServerPort =
      identity?.serverPort === Number(EXPECTED_PORT) ||
      identity?.serverPort === EXPECTED_CONTAINER_PORT;

    const matches = {
      database: identity?.database === EXPECTED_DATABASE,
      role: identity?.role === EXPECTED_ROLE,
      serverAddress: validServerAddress,
      serverPort: validServerPort,
    };
    const identityMatches = Object.values(matches).every(Boolean);

    console.log(JSON.stringify({
      observedIdentity: {
        database: identity?.database ?? null,
        role: identity?.role ?? null,
        serverAddress: identity?.serverAddress ?? null,
        normalizedServerAddress,
        serverPort: identity?.serverPort ?? null,
      },
      matches,
      allExpectedFieldsMatch: identityMatches,
    }));

    if (process.env.PG_AGENT_NOTIFICATIONS_IDENTITY_ONLY === '1') {
      console.log('Identity-only diagnostic complete; no database writes were performed.');
      return;
    }

    if (!identityMatches) {
      throw new SafeTestConfigurationError(
        'Refusing database writes: connected PostgreSQL identity did not match the isolated local test target.',
      );
    }

    console.log('Verified isolated PostgreSQL target 127.0.0.1:5433/junkitout_agent_test.');

    fixturesCreated = true;
    const customerPhone = `pg-test-customer-${testId}`;
    const agentPhone = `pg-test-agent-${testId}`;
    await prisma.user.create({
      data: { id: customerUserId, phone: customerPhone, name: 'PostgreSQL test customer' },
    });
    await prisma.user.create({
      data: { id: agentUserId, phone: agentPhone, name: 'PostgreSQL test agent', role: 'AGENT' },
    });
    await prisma.customer.create({ data: { id: customerId, userId: customerUserId } });
    await prisma.address.create({
      data: {
        id: addressId,
        userId: customerUserId,
        name: 'PostgreSQL test pickup',
        phone: customerPhone,
        houseNo: 'Test 1',
        street: 'Test Street',
        area: 'Test Area',
        pincode: '560001',
        lat: 12.9,
        lng: 77.6,
      },
    });
    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber,
        customerId,
        addressId,
      },
    });
    const offer: AgentPickupOffer = {
      orderId,
      orderNumber,
      agentId: `agent-${testId}`,
      agentUserId,
      agentPhone,
      pickupAddress: 'Test Street, Test Area, Bengaluru 560001',
      latitude: 12.9,
      longitude: 77.6,
      mapsLink: 'https://www.google.com/maps?q=12.9%2C77.6',
    };

    let releaseInsertAttempts!: () => void;
    const bothInsertAttemptsReady = new Promise<void>((resolve) => {
      releaseInsertAttempts = resolve;
    });
    let insertAttemptsReady = 0;
    const insertConcurrently = async () => {
      insertAttemptsReady += 1;
      if (insertAttemptsReady === 2) releaseInsertAttempts();
      await bothInsertAttemptsReady;
      return persistAgentPickupNotificationsOnce(prisma, [offer]);
    };

    const insertCounts = await Promise.all([insertConcurrently(), insertConcurrently()]);
    assert.deepEqual(
      insertCounts.sort((left, right) => left - right),
      [0, 1],
      'PostgreSQL primary-key conflict handling permits exactly one concurrent insert',
    );
    assert.equal(
      await prisma.notification.count({ where: { id: notificationId, orderId } }),
      1,
      'exactly one order-scoped notification row exists',
    );

    let releaseClaims!: () => void;
    const bothClaimsReady = new Promise<void>((resolve) => {
      releaseClaims = resolve;
    });
    let claimAttemptsReady = 0;
    const claim = async (id: string) => {
      claimAttemptsReady += 1;
      if (claimAttemptsReady === 2) releaseClaims();
      await bothClaimsReady;

      const staleSendingCutoff = new Date(Date.now() - 2 * 60_000);
      const result = await prisma.notification.updateMany({
        where: {
          id,
          orderId,
          OR: [
            { status: { in: ['QUEUED', 'FAILED'] } },
            { status: 'SENDING', sentAt: { lt: staleSendingCutoff } },
          ],
        },
        data: {
          status: 'SENDING',
          deliveryStatus: 'sending',
          statusDescription: 'Sending agent pickup alert.',
          sentAt: new Date(),
        },
      });
      return result.count === 1;
    };

    let mockedProviderCalls = 0;
    const deliveryDependencies = {
      claim,
      send: async () => {
        mockedProviderCalls += 1;
        return { success: true, requestId: 'mock-provider-request' };
      },
      markSent: async (id: string, requestId?: string) => {
        await prisma.notification.updateMany({
          where: { id, orderId, status: 'SENDING' },
          data: {
            status: 'SENT',
            deliveryStatus: 'sent',
            statusDescription: 'Mock provider accepted pickup alert.',
            providerRequestId: requestId,
            sentAt: new Date(),
          },
        });
      },
      markFailed: async (id: string) => {
        await prisma.notification.updateMany({
          where: { id, orderId, status: 'SENDING' },
          data: { status: 'FAILED', deliveryStatus: 'failed', sentAt: new Date() },
        });
      },
    };

    await Promise.all([
      deliverAgentPickupNotifications([offer], deliveryDependencies),
      deliverAgentPickupNotifications([offer], deliveryDependencies),
    ]);

    assert.equal(mockedProviderCalls, 1, 'only the winning database claim invokes the mocked provider');
    const notification = await prisma.notification.findUnique({
      where: { id: notificationId },
      select: { orderId: true, status: true, providerRequestId: true },
    });
    assert.equal(notification?.orderId, orderId);
    assert.equal(notification?.status, 'SENT');
    assert.equal(notification?.providerRequestId, 'mock-provider-request');

    console.log('PostgreSQL notification insert and competing-claim concurrency checks passed.');
  } finally {
    try {
      if (fixturesCreated) {
        await prisma.notification.deleteMany({ where: { id: notificationId, orderId } });
        await prisma.order.deleteMany({ where: { id: orderId, orderNumber } });
        await prisma.address.deleteMany({ where: { id: addressId, userId: customerUserId } });
        await prisma.customer.deleteMany({ where: { id: customerId, userId: customerUserId } });
        await prisma.user.deleteMany({ where: { id: { in: [customerUserId, agentUserId] } } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }
}

void run().catch((error: unknown) => {
  if (error instanceof SafeTestConfigurationError) {
    console.error(error.message);
  } else {
    console.error('PostgreSQL integration test failed; details suppressed to protect connection credentials.');
  }
  process.exitCode = 1;
});
