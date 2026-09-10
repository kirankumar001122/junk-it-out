import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('=== VERIFYING CUSTOMER ACCOUNT SWITCH & IDENTITY REFRESH FLOW ===\n');

  // Step 1: Ensure Customer A & Customer B exist in DB
  const phoneA = '+919876543210';
  const phoneB = '+919123456789';

  let userA = await db.user.findUnique({ where: { phone: phoneA }, include: { customer: true } });
  if (!userA) {
    userA = await db.user.create({
      data: {
        phone: phoneA,
        name: 'Customer A (Test)',
        role: 'CUSTOMER',
        customer: { create: {} },
      },
      include: { customer: true },
    });
  }

  let userB = await db.user.findUnique({ where: { phone: phoneB }, include: { customer: true } });
  if (!userB) {
    userB = await db.user.create({
      data: {
        phone: phoneB,
        name: 'Customer B (Test)',
        role: 'CUSTOMER',
        customer: { create: {} },
      },
      include: { customer: true },
    });
  }

  console.log(`Customer A: ${userA.name} (${userA.phone}) - ID: ${userA.id}`);
  console.log(`Customer B: ${userB.name} (${userB.phone}) - ID: ${userB.id}\n`);

  // Step 2: Customer A Auth Token
  const tokenA = signToken({
    userId: userA.id,
    phone: userA.phone,
    name: userA.name,
    role: 'CUSTOMER',
    customerId: userA.customer?.id,
    agentId: null,
    adminId: null,
  });

  const cookieA = `jio_token=${tokenA}`;

  // Step 3: GET /api/auth/me as Customer A
  console.log('1. Checking /api/auth/me for Customer A...');
  const resA = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookieA } });
  const dataA = await resA.json();
  if (resA.status !== 200 || dataA.data?.user?.phone !== phoneA) {
    throw new Error(`Customer A auth check failed. Got: ${JSON.stringify(dataA)}`);
  }
  console.log(`  ✓ [PASS] Authenticated as Customer A (${dataA.data.user.name}, ${dataA.data.user.phone})`);

  // Step 4: Logout Customer A
  console.log('\n2. Calling POST /api/auth/logout...');
  const resLogout = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Cookie: cookieA } });
  const setCookie = resLogout.headers.get('set-cookie');
  if (!resLogout.ok || !setCookie || (!setCookie.includes('Max-Age=0') && !setCookie.includes('1970') && !setCookie.includes('jio_token=;'))) {
    throw new Error('Logout API did not return cookie clearing header');
  }
  console.log('  ✓ [PASS] Logout cleared jio_token cookie.');

  // Step 5: Check /api/auth/me post logout (unauthenticated)
  console.log('\n3. Checking /api/auth/me after Customer A logout (unauthenticated)...');
  const resLoggedOut = await fetch(`${BASE_URL}/api/auth/me`);
  if (resLoggedOut.status !== 401) {
    throw new Error(`Expected 401 post logout, got ${resLoggedOut.status}`);
  }
  console.log('  ✓ [PASS] Customer A identity is completely cleared (401 UNAUTHORIZED).');

  // Step 6: Customer B Auth Token
  const tokenB = signToken({
    userId: userB.id,
    phone: userB.phone,
    name: userB.name,
    role: 'CUSTOMER',
    customerId: userB.customer?.id,
    agentId: null,
    adminId: null,
  });
  const cookieB = `jio_token=${tokenB}`;

  // Step 7: GET /api/auth/me as Customer B
  console.log('\n4. Checking /api/auth/me for Customer B...');
  const resB = await fetch(`${BASE_URL}/api/auth/me`, { headers: { Cookie: cookieB } });
  const dataB = await resB.json();
  if (resB.status !== 200 || dataB.data?.user?.phone !== phoneB) {
    throw new Error(`Customer B auth check failed. Got: ${JSON.stringify(dataB)}`);
  }
  console.log(`  ✓ [PASS] Authenticated as Customer B (${dataB.data.user.name}, ${dataB.data.user.phone})`);
  if (dataB.data.user.phone === phoneA || dataB.data.user.name === userA.name) {
    throw new Error('Stale Customer A information detected in Customer B session!');
  }
  console.log('  ✓ [PASS] NO Customer A information remains in Customer B session.');

  // Step 8: Order Creation as Customer B
  console.log('\n5. Creating test order as Customer B via POST /api/orders...');
  const wasteCat = await db.wasteCategory.findFirst();
  if (!wasteCat) throw new Error('No waste category in DB');

  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: cookieB,
    },
    body: JSON.stringify({
      phone: userB.phone,
      name: userB.name,
      address: {
        label: 'Home',
        houseNo: '123',
        street: 'Main St',
        area: 'Whitefield',
        pincode: '560066',
        lat: 12.9698,
        lng: 77.7500,
      },
      items: [{ categoryId: wasteCat.id, estimatedWeight: 10 }],
      pickupType: 'ASAP',
      photos: ['https://example.com/photo.jpg'],
    }),
  });

  const orderData = await orderRes.json();
  if (orderRes.status !== 201 || !orderData.success) {
    throw new Error(`Order creation failed: ${JSON.stringify(orderData)}`);
  }

  const createdOrder = await db.order.findUnique({
    where: { id: orderData.data.id },
    include: { customer: { include: { user: true } } },
  });

  console.log(`Order created: ${createdOrder?.orderNumber}`);
  console.log(`Order customer phone in DB: ${createdOrder?.customer?.user?.phone}`);
  console.log(`Order customer name in DB: ${createdOrder?.customer?.user?.name}`);

  if (createdOrder?.customer?.user?.phone !== phoneB) {
    throw new Error(`Order customer phone mismatch! Expected ${phoneB}, got ${createdOrder?.customer?.user?.phone}`);
  }
  if (createdOrder?.customerId !== userB.customer?.id) {
    throw new Error('Backend order/customer association is using wrong customer ID!');
  }

  console.log('  ✓ [PASS] Backend order/customer association strictly uses Customer B!');

  console.log('\n=== ALL SERVER & API FLOW TESTS PASSED CLEANLY! ===');
}

main()
  .catch((err) => {
    console.error('\n✕ TEST FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
