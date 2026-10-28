import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { basename } from 'node:path';
import { executeAgentAcceptTransaction } from '../lib/services/agentService';

const EXPECTED_HOST = '127.0.0.1';
const EXPECTED_PORT = '5433';
const EXPECTED_DATABASE = 'junkitout_agent_test';
const EXPECTED_ROLE = 'junkitout_test';
const EXPECTED_CONTAINER_HOST = '172.17.0.2';
const EXPECTED_CONTAINER_PORT = 5432;

class SafeTestConfigurationError extends Error {}

function normalizeServerAddress(address: string | null | undefined) {
  if (!address) return null;
  return address.replace(/\/32$/, '');
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
  const prismaA = await createPrismaClient(databaseUrl);
  const prismaB = await createPrismaClient(databaseUrl);

  const testId = randomUUID();
  const customerUserId = `pg-agent-cust-user-${testId}`;
  const customerId = `pg-agent-cust-rec-${testId}`;
  const addressId = `pg-agent-addr-${testId}`;
  const agentUserAId = `pg-agent-user-a-${testId}`;
  const agentUserBId = `pg-agent-user-b-${testId}`;
  const agentAId = `pg-agent-rec-a-${testId}`;
  const agentBId = `pg-agent-rec-b-${testId}`;

  const order1Id = `pg-agent-ord-1-${testId}`;
  const order1Number = `JIO-PG1-${testId}`;
  const order2Id = `pg-agent-ord-2-${testId}`;
  const order2Number = `JIO-PG2-${testId}`;
  const order3Id = `pg-agent-ord-3-${testId}`;
  const order3Number = `JIO-PG3-${testId}`;

  let fixturesCreated = false;

  try {
    // 1. Verify isolated target identity on both clients
    const [identityA] = await prismaA.$queryRaw<Array<{
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

    const normalizedServerAddress = normalizeServerAddress(identityA?.serverAddress);
    const validServerAddress =
      normalizedServerAddress === EXPECTED_HOST ||
      normalizedServerAddress === EXPECTED_CONTAINER_HOST;
    const validServerPort =
      identityA?.serverPort === Number(EXPECTED_PORT) ||
      identityA?.serverPort === EXPECTED_CONTAINER_PORT;

    const identityMatches =
      identityA?.database === EXPECTED_DATABASE &&
      identityA?.role === EXPECTED_ROLE &&
      validServerAddress &&
      validServerPort;

    if (process.env.PG_AGENT_CONCURRENCY_IDENTITY_ONLY === '1') {
      console.log('PostgreSQL concurrency identity check successful; no writes performed.');
      return;
    }

    if (!identityMatches) {
      throw new SafeTestConfigurationError(
        'Refusing database operations: connected PostgreSQL identity did not match isolated local target.',
      );
    }

    console.log(`Verified isolated PostgreSQL target ${EXPECTED_HOST}:${EXPECTED_PORT}/${EXPECTED_DATABASE}.`);

    // 2. Create test fixtures
    fixturesCreated = true;
    const customerPhone = `+9199${Math.floor(10000000 + Math.random() * 90000000)}`;
    const agentAPhone = `+9198${Math.floor(10000000 + Math.random() * 90000000)}`;
    const agentBPhone = `+9197${Math.floor(10000000 + Math.random() * 90000000)}`;

    await prismaA.user.create({
      data: { id: customerUserId, phone: customerPhone, name: 'PG Customer' },
    });
    await prismaA.customer.create({
      data: { id: customerId, userId: customerUserId },
    });
    await prismaA.address.create({
      data: {
        id: addressId,
        userId: customerUserId,
        name: 'PG Customer Pickup',
        phone: customerPhone,
        houseNo: '10',
        street: 'Test Street',
        area: 'Koramangala',
        pincode: '560034',
        lat: 12.93,
        lng: 77.62,
      },
    });

    await prismaA.user.create({
      data: { id: agentUserAId, phone: agentAPhone, name: 'Agent Alpha', role: 'AGENT' },
    });
    await prismaA.agent.create({
      data: {
        id: agentAId,
        userId: agentUserAId,
        vehicleType: 'VAN',
        vehicleNumber: 'KA-01-A-1001',
        status: 'AVAILABLE',
        serviceAreas: 'Koramangala',
      },
    });

    await prismaA.user.create({
      data: { id: agentUserBId, phone: agentBPhone, name: 'Agent Beta', role: 'AGENT' },
    });
    await prismaA.agent.create({
      data: {
        id: agentBId,
        userId: agentUserBId,
        vehicleType: 'TRUCK',
        vehicleNumber: 'KA-01-B-2002',
        status: 'AVAILABLE',
        serviceAreas: 'Koramangala',
      },
    });

    await prismaA.order.create({
      data: {
        id: order1Id,
        orderNumber: order1Number,
        customerId,
        addressId,
        status: 'AGENT_BEING_ASSIGNED',
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'PENDING',
      },
    });

    // -------------------------------------------------------------------------
    // Scenario 1: Competing Accept (Two agents accept the same order simultaneously)
    // -------------------------------------------------------------------------
    let releaseScenario1Barrier!: () => void;
    const scenario1Barrier = new Promise<void>((resolve) => {
      releaseScenario1Barrier = resolve;
    });
    let scenario1Ready = 0;

    const acceptOrder1ByAgentA = async () => {
      scenario1Ready += 1;
      if (scenario1Ready === 2) releaseScenario1Barrier();
      await scenario1Barrier;
      return executeAgentAcceptTransaction(prismaA, {
        order: {
          id: order1Id,
          orderNumber: order1Number,
          agentId: null,
          status: 'AGENT_BEING_ASSIGNED',
          financialDirection: 'JUNKITOUT_PAYS',
          paymentStatus: 'PENDING',
        },
        agentId: agentAId,
        agentName: 'Agent Alpha',
        vehicleNumber: 'KA-01-A-1001',
        agentUserId: agentUserAId,
        userId: agentUserAId,
      });
    };

    const acceptOrder1ByAgentB = async () => {
      scenario1Ready += 1;
      if (scenario1Ready === 2) releaseScenario1Barrier();
      await scenario1Barrier;
      return executeAgentAcceptTransaction(prismaB, {
        order: {
          id: order1Id,
          orderNumber: order1Number,
          agentId: null,
          status: 'AGENT_BEING_ASSIGNED',
          financialDirection: 'JUNKITOUT_PAYS',
          paymentStatus: 'PENDING',
        },
        agentId: agentBId,
        agentName: 'Agent Beta',
        vehicleNumber: 'KA-01-B-2002',
        agentUserId: agentUserBId,
        userId: agentUserBId,
      });
    };

    const [resultA, resultB] = await Promise.all([acceptOrder1ByAgentA(), acceptOrder1ByAgentB()]);

    const winner = resultA.changed ? 'A' : resultB.changed ? 'B' : 'NONE';
    assert.notEqual(winner, 'NONE', 'Exactly one concurrent accept transaction must succeed');
    assert.equal(
      resultA.changed !== resultB.changed,
      true,
      'One agent must succeed and one must fail under concurrent accept',
    );

    const loserResult = resultA.changed ? resultB : resultA;
    assert.equal(loserResult.changed, false);
    assert.equal(loserResult.reason, 'orderChanged');
    assert.equal(loserResult.alreadyAssignedToAgent, false);

    // Verify database state after Scenario 1
    const finalOrder1 = await prismaA.order.findUnique({
      where: { id: order1Id },
      include: { statusHistory: true },
    });
    assert.equal(finalOrder1?.status, 'AGENT_ACCEPTED');
    assert.equal(finalOrder1?.agentId, winner === 'A' ? agentAId : agentBId);

    const historyEntries = finalOrder1?.statusHistory || [];
    assert.equal(historyEntries.length, 1, 'Exactly one order status history transition recorded');
    assert.equal(historyEntries[0].oldStatus, 'AGENT_BEING_ASSIGNED');
    assert.equal(historyEntries[0].newStatus, 'AGENT_ACCEPTED');

    const winnerAgentRec = await prismaA.agent.findUnique({
      where: { id: winner === 'A' ? agentAId : agentBId },
    });
    assert.equal(winnerAgentRec?.status, 'ASSIGNED');

    const loserAgentRec = await prismaA.agent.findUnique({
      where: { id: winner === 'A' ? agentBId : agentAId },
    });
    assert.equal(loserAgentRec?.status, 'AVAILABLE', 'Losing agent must remain AVAILABLE');

    // -------------------------------------------------------------------------
    // Scenario 2: Double Accept (One agent attempts to accept two different orders)
    // -------------------------------------------------------------------------
    // Use Agent B (who is still AVAILABLE). Create order 2 and order 3.
    await prismaA.order.create({
      data: {
        id: order2Id,
        orderNumber: order2Number,
        customerId,
        addressId,
        status: 'AGENT_BEING_ASSIGNED',
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'PENDING',
      },
    });

    await prismaA.order.create({
      data: {
        id: order3Id,
        orderNumber: order3Number,
        customerId,
        addressId,
        status: 'AGENT_BEING_ASSIGNED',
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'PENDING',
      },
    });

    let releaseScenario2Barrier!: () => void;
    const scenario2Barrier = new Promise<void>((resolve) => {
      releaseScenario2Barrier = resolve;
    });
    let scenario2Ready = 0;

    const acceptOrder2ByAgentB = async () => {
      scenario2Ready += 1;
      if (scenario2Ready === 2) releaseScenario2Barrier();
      await scenario2Barrier;
      return executeAgentAcceptTransaction(prismaA, {
        order: {
          id: order2Id,
          orderNumber: order2Number,
          agentId: null,
          status: 'AGENT_BEING_ASSIGNED',
          financialDirection: 'JUNKITOUT_PAYS',
          paymentStatus: 'PENDING',
        },
        agentId: agentBId,
        agentName: 'Agent Beta',
        vehicleNumber: 'KA-01-B-2002',
        agentUserId: agentUserBId,
        userId: agentUserBId,
      });
    };

    const acceptOrder3ByAgentB = async () => {
      scenario2Ready += 1;
      if (scenario2Ready === 2) releaseScenario2Barrier();
      await scenario2Barrier;
      return executeAgentAcceptTransaction(prismaB, {
        order: {
          id: order3Id,
          orderNumber: order3Number,
          agentId: null,
          status: 'AGENT_BEING_ASSIGNED',
          financialDirection: 'JUNKITOUT_PAYS',
          paymentStatus: 'PENDING',
        },
        agentId: agentBId,
        agentName: 'Agent Beta',
        vehicleNumber: 'KA-01-B-2002',
        agentUserId: agentUserBId,
        userId: agentUserBId,
      });
    };

    const [resultOrder2, resultOrder3] = await Promise.all([acceptOrder2ByAgentB(), acceptOrder3ByAgentB()]);

    const successfulAccepts = [resultOrder2, resultOrder3].filter((r) => r.changed);
    assert.equal(successfulAccepts.length, 1, 'At most one accept transaction may succeed for the same agent');

    const rejectedAccept = [resultOrder2, resultOrder3].find((r) => !r.changed);
    assert.ok(
      rejectedAccept?.reason === 'activeAssignment' || rejectedAccept?.reason === 'agentUnavailable',
      `Concurrent double accept must be rejected with activeAssignment or agentUnavailable (got ${rejectedAccept?.reason})`,
    );

    // Verify Agent B has exactly 1 active order assigned
    const agentBActiveOrders = await prismaA.order.count({
      where: {
        agentId: agentBId,
        status: { in: ['AGENT_ASSIGNED', 'AGENT_ACCEPTED', 'AGENT_ON_WAY', 'AGENT_ARRIVED', 'WASTE_VERIFICATION', 'WEIGHING'] },
      },
    });
    assert.equal(agentBActiveOrders, 1, 'Agent B must have exactly 1 active order in the database');

    // -------------------------------------------------------------------------
    // Scenario 3: Idempotent Retry
    // -------------------------------------------------------------------------
    // Retrying the won order for Agent B returns alreadyAssignedToAgent: true
    const wonOrderId = resultOrder2.changed ? order2Id : order3Id;
    const wonOrderNumber = resultOrder2.changed ? order2Number : order3Number;

    const retryResult = await executeAgentAcceptTransaction(prismaA, {
      order: {
        id: wonOrderId,
        orderNumber: wonOrderNumber,
        agentId: agentBId,
        status: 'AGENT_ACCEPTED',
        financialDirection: 'JUNKITOUT_PAYS',
        paymentStatus: 'PENDING',
      },
      agentId: agentBId,
      agentName: 'Agent Beta',
      vehicleNumber: 'KA-01-B-2002',
      agentUserId: agentUserBId,
      userId: agentUserBId,
    });

    assert.equal(retryResult.changed, false);
    assert.equal(retryResult.alreadyAssignedToAgent, true, 'Repeat accept by same agent returns alreadyAssignedToAgent: true');

    // -------------------------------------------------------------------------
    // Scenario 4: Rollback Safety
    // -------------------------------------------------------------------------
    // Simulate transaction abort when an error is thrown inside transaction
    let rollbackThrew = false;
    try {
      await prismaA.$transaction(async (tx) => {
        await tx.orderStatusHistory.create({
          data: {
            orderId: order1Id,
            oldStatus: 'AGENT_ACCEPTED',
            newStatus: 'AGENT_ON_WAY',
            notes: 'Simulated rollback entry',
          },
        });
        throw new Error('SIMULATED_TRANSACTION_FAILURE');
      });
    } catch (e: any) {
      if (e.message === 'SIMULATED_TRANSACTION_FAILURE') rollbackThrew = true;
    }
    assert.equal(rollbackThrew, true);

    const checkRollbackHistory = await prismaA.orderStatusHistory.findMany({
      where: { notes: 'Simulated rollback entry' },
    });
    assert.equal(checkRollbackHistory.length, 0, 'Rolled back transaction must leave no history records');

    console.log('PostgreSQL agent accept concurrency, single-order invariant, and rollback checks passed.');
  } finally {
    try {
      if (fixturesCreated) {
        await prismaA.notification.deleteMany({
          where: { orderId: { in: [order1Id, order2Id, order3Id] } },
        });
        await prismaA.orderStatusHistory.deleteMany({
          where: { orderId: { in: [order1Id, order2Id, order3Id] } },
        });
        await prismaA.order.deleteMany({
          where: { id: { in: [order1Id, order2Id, order3Id] } },
        });
        await prismaA.address.deleteMany({
          where: { id: addressId },
        });
        await prismaA.agent.deleteMany({
          where: { id: { in: [agentAId, agentBId] } },
        });
        await prismaA.customer.deleteMany({
          where: { id: customerId },
        });
        await prismaA.user.deleteMany({
          where: { id: { in: [customerUserId, agentUserAId, agentUserBId] } },
        });
      }
    } finally {
      await prismaA.$disconnect();
      await prismaB.$disconnect();
    }
  }
}

void run().catch((error: unknown) => {
  if (error instanceof SafeTestConfigurationError) {
    console.error(error.message);
  } else {
    const err = error as Record<string, unknown> | null | undefined;
    const name = typeof err?.name === 'string' ? err.name : 'UnknownError';
    const rawMessage = typeof err?.message === 'string' ? err.message : String(error);
    // Sanitize any database URL or credentials if present in the message
    const message = rawMessage.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/gi, '$1***$3');
    const prismaCode = typeof err?.code === 'string' ? err.code : undefined;

    console.error('PostgreSQL integration test failed:', {
      name,
      message,
      ...(prismaCode ? { prismaCode } : {}),
    });
  }
  process.exitCode = 1;
});
