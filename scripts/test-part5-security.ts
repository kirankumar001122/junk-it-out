import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

async function runSecurityTests() {
  console.log('====================================================');
  console.log('🛡️  PART 5: SECURITY CHECKS EVALUATION & AUDIT');
  console.log('====================================================\n');

  const baseUrl = 'http://localhost:3000';

  // 1. Fetch DB records to form legitimate test context
  const superAdminUser = await db.user.findFirst({
    where: { role: 'SUPER_ADMIN' },
  });
  const customerUser = await db.user.findFirst({
    where: { role: 'CUSTOMER' },
    include: { customer: true },
  });
  const agent = await db.agent.findFirst({
    include: { user: true },
  });
  const order = await db.order.findFirst();

  if (!superAdminUser || !customerUser || !agent || !order) {
    console.error('Missing prerequisites in database to run tests.');
    return;
  }

  // Generate tokens
  const adminToken = signToken({
    userId: superAdminUser.id,
    phone: superAdminUser.phone,
    name: superAdminUser.name,
    role: 'SUPER_ADMIN',
  });

  const customerToken = signToken({
    userId: customerUser.id,
    phone: customerUser.phone,
    name: customerUser.name,
    role: 'CUSTOMER',
    customerId: customerUser.customer?.id,
  });

  const agentInitialToken = signToken({
    userId: agent.user.id,
    phone: agent.user.phone,
    name: agent.user.name,
    role: 'AGENT',
    agentId: agent.id,
    tokenVersion: agent.tokenVersion ?? 1,
  });

  console.log('📌 Test Entities Prepared:');
  console.log(`- Admin: ${superAdminUser.name} (${superAdminUser.phone}, Role: ${superAdminUser.role})`);
  console.log(`- Customer: ${customerUser.name} (${customerUser.phone}, Role: ${customerUser.role})`);
  console.log(`- Agent: ${agent.user.name} (${agent.user.phone}, ID: ${agent.id}, DB tokenVersion: ${agent.tokenVersion})`);
  console.log(`- Order: #${order.orderNumber} (ID: ${order.id}, Status: ${order.status})\n`);

  // -----------------------------------------------------------
  // STEP 1: Unauthenticated Checks (401 / 403)
  // -----------------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('TEST 1: Unauthenticated Requests (No Token/Cookie)');
  console.log('----------------------------------------------------');

  // 1a. GET /api/admin/stats without token
  const res1a = await fetch(`${baseUrl}/api/admin/stats`);
  const body1a = await res1a.json().catch(() => ({}));
  console.log(`1a. GET /api/admin/stats (Unauthenticated):`);
  console.log(`    Status: ${res1a.status} (Expected: 403)`);
  console.log(`    Response:`, body1a);
  const test1aPass = res1a.status === 403 && (body1a?.error?.code === 'FORBIDDEN' || body1a?.code === 'FORBIDDEN');
  console.log(`    Result: ${test1aPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // 1b. POST /api/orders/{id}/assign without token
  const res1b = await fetch(`${baseUrl}/api/orders/${order.id}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agentId: agent.id }),
  });
  const body1b = await res1b.json().catch(() => ({}));
  console.log(`1b. POST /api/orders/{id}/assign (Unauthenticated):`);
  console.log(`    Status: ${res1b.status} (Expected: 403)`);
  console.log(`    Response:`, body1b);
  const test1bPass = res1b.status === 403 && (body1b?.error?.code === 'FORBIDDEN' || body1b?.code === 'FORBIDDEN');
  console.log(`    Result: ${test1bPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // -----------------------------------------------------------
  // STEP 2: Role Tampering Check (403 Forbidden)
  // -----------------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('TEST 2: Role Tampering Check (CUSTOMER accessing Admin APIs)');
  console.log('----------------------------------------------------');

  // 2a. Customer calling GET /api/admin/stats
  const res2a = await fetch(`${baseUrl}/api/admin/stats`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const body2a = await res2a.json().catch(() => ({}));
  console.log(`2a. Customer GET /api/admin/stats:`);
  console.log(`    Status: ${res2a.status} (Expected: 403)`);
  console.log(`    Response:`, body2a);
  const test2aPass = res2a.status === 403 && (body2a?.error?.code === 'FORBIDDEN' || body2a?.code === 'FORBIDDEN');
  console.log(`    Result: ${test2aPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // 2b. Customer calling GET /api/admin/agents
  const res2b = await fetch(`${baseUrl}/api/admin/agents`, {
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const body2b = await res2b.json().catch(() => ({}));
  console.log(`2b. Customer GET /api/admin/agents:`);
  console.log(`    Status: ${res2b.status} (Expected: 403)`);
  console.log(`    Response:`, body2b);
  const test2bPass = res2b.status === 403;
  console.log(`    Result: ${test2bPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // 2c. Customer calling POST /api/orders/{id}/assign
  const res2c = await fetch(`${baseUrl}/api/orders/${order.id}/assign`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${customerToken}`,
    },
    body: JSON.stringify({ agentId: agent.id }),
  });
  const body2c = await res2c.json().catch(() => ({}));
  console.log(`2c. Customer POST /api/orders/{id}/assign:`);
  console.log(`    Status: ${res2c.status} (Expected: 403)`);
  console.log(`    Response:`, body2c);
  const test2cPass = res2c.status === 403 && (body2c?.error?.code === 'FORBIDDEN' || body2c?.code === 'FORBIDDEN');
  console.log(`    Result: ${test2cPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // -----------------------------------------------------------
  // STEP 3: Agent Action Authorization (Role Enforcement)
  // -----------------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('TEST 3: Agent Action Authorization (Enforcing AGENT Role)');
  console.log('----------------------------------------------------');

  // 3a. Admin attempting POST /api/orders/{id}/arrive
  const res3a = await fetch(`${baseUrl}/api/orders/${order.id}/arrive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminToken}` },
  });
  const body3a = await res3a.json().catch(() => ({}));
  console.log(`3a. Admin POST /api/orders/{id}/arrive:`);
  console.log(`    Status: ${res3a.status} (Expected: 401 Unauthorized for non-AGENT)`);
  console.log(`    Response:`, body3a);
  const test3aPass = res3a.status === 401 && (body3a?.error?.code === 'UNAUTHORIZED' || body3a?.code === 'UNAUTHORIZED');
  console.log(`    Result: ${test3aPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // 3b. Customer attempting POST /api/orders/{id}/arrive
  const res3b = await fetch(`${baseUrl}/api/orders/${order.id}/arrive`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${customerToken}` },
  });
  const body3b = await res3b.json().catch(() => ({}));
  console.log(`3b. Customer POST /api/orders/{id}/arrive:`);
  console.log(`    Status: ${res3b.status} (Expected: 401 Unauthorized for non-AGENT)`);
  console.log(`    Response:`, body3b);
  const test3bPass = res3b.status === 401 && (body3b?.error?.code === 'UNAUTHORIZED' || body3b?.code === 'UNAUTHORIZED');
  console.log(`    Result: ${test3bPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // 3c. Admin attempting POST /api/orders/{id}/weigh
  const res3c = await fetch(`${baseUrl}/api/orders/${order.id}/weigh`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      actualWeights: [{ categoryId: 'test', actualWeight: 10 }],
    }),
  });
  const body3c = await res3c.json().catch(() => ({}));
  console.log(`3c. Admin POST /api/orders/{id}/weigh:`);
  console.log(`    Status: ${res3c.status} (Expected: 401 Unauthorized for non-AGENT)`);
  console.log(`    Response:`, body3c);
  const test3cPass = res3c.status === 401 && (body3c?.error?.code === 'UNAUTHORIZED' || body3c?.code === 'UNAUTHORIZED');
  console.log(`    Result: ${test3cPass ? '✅ PASSED' : '❌ FAILED'}\n`);

  // -----------------------------------------------------------
  // STEP 4: Session Invalidation Check (Force Exit & Token Version)
  // -----------------------------------------------------------
  console.log('----------------------------------------------------');
  console.log('TEST 4: Agent Session Invalidation Check (Force Exit)');
  console.log('----------------------------------------------------');

  const preAgent = await db.agent.findUnique({
    where: { id: agent.id },
    select: { tokenVersion: true, status: true },
  });
  const currentVersion = preAgent?.tokenVersion ?? 1;
  console.log(`4a. Pre-Force-Exit DB state: tokenVersion = ${currentVersion}, status = ${preAgent?.status}`);

  // Create token with currentVersion
  const agentPriorToken = signToken({
    userId: agent.user.id,
    phone: agent.user.phone,
    name: agent.user.name,
    role: 'AGENT',
    agentId: agent.id,
    tokenVersion: currentVersion,
  });

  // Call Force Exit API using Admin Token
  console.log(`4b. Triggering POST /api/admin/agents/force-exit...`);
  const forceExitRes = await fetch(`${baseUrl}/api/admin/agents/force-exit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ agentId: agent.id }),
  });
  const forceExitBody = await forceExitRes.json().catch(() => ({}));
  console.log(`    Force Exit Response:`, forceExitBody);

  const postAgent = await db.agent.findUnique({
    where: { id: agent.id },
    select: { tokenVersion: true, status: true },
  });
  console.log(`    Post-Force-Exit DB state: tokenVersion = ${postAgent?.tokenVersion}, status = ${postAgent?.status}`);
  const versionIncremented = (postAgent?.tokenVersion ?? 0) > currentVersion;
  console.log(`    Version incremented in DB: ${versionIncremented ? '✅ YES' : '❌ NO'}\n`);

  // Now make request using that agent's prior token (version was currentVersion, DB is now currentVersion + 1)
  console.log(`4c. Making request using agent's prior token (version ${currentVersion}) to POST /api/orders/${order.id}/arrive:`);
  const staleTokenRes = await fetch(`${baseUrl}/api/orders/${order.id}/arrive`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${agentPriorToken}`,
    },
  });
  const staleTokenBody = await staleTokenRes.json().catch(() => ({}));
  console.log(`    Status: ${staleTokenRes.status} (Expected: 401 Unauthorized)`);
  console.log(`    Response:`, staleTokenBody);
  const test4Pass = staleTokenRes.status === 401 && (staleTokenBody?.error?.code === 'UNAUTHORIZED' || staleTokenBody?.code === 'UNAUTHORIZED');
  console.log(`    Result: ${test4Pass ? '✅ PASSED (Stale token rejected by middleware)' : '❌ FAILED'}\n`);

  // Final summary
  console.log('====================================================');
  console.log('📊 FINAL SECURITY EVALUATION SUMMARY:');
  console.log(`- Test 1 (Unauthenticated 403 Check):       ${test1aPass && test1bPass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`- Test 2 (Role Tampering 403 Forbidden):    ${test2aPass && test2bPass && test2cPass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`- Test 3 (Agent Role Enforcement 401):     ${test3aPass && test3bPass && test3cPass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log(`- Test 4 (Force Exit Session Invalidation): ${test4Pass ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log('====================================================');
}

runSecurityTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  });
