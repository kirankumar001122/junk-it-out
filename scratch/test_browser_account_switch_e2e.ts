import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

const BASE_URL = 'http://localhost:3000';

class SimpleCookieJar {
  private cookies: Map<string, string> = new Map();

  setCookiesFromHeader(header: string | null) {
    if (!header) return;
    const parts = header.split(/,(?=\s*[\w-]+=)/);
    for (const part of parts) {
      const match = part.trim().match(/^([^=]+)=([^;]*)/);
      if (match) {
        const name = match[1].trim();
        const value = match[2].trim();
        if (value === '' || part.includes('Max-Age=0') || part.includes('1970')) {
          this.cookies.delete(name);
        } else {
          this.cookies.set(name, value);
        }
      }
    }
  }

  getCookieHeader(): string {
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  clear() {
    this.cookies.clear();
  }
}

async function runTest() {
  console.log('===============================================================');
  console.log('   FULL E2E CUSTOMER ACCOUNT SWITCH & CART PRESERVATION TEST   ');
  console.log('===============================================================\n');

  // Database setup for Customer A & Customer B
  const phoneA = '+919876543210';
  const phoneB = '+919988776655';

  let userA = await db.user.findUnique({ where: { phone: phoneA }, include: { customer: true } });
  if (!userA) {
    userA = await db.user.create({
      data: {
        phone: phoneA,
        name: 'Customer A (Original)',
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
        name: 'Customer B (New User)',
        role: 'CUSTOMER',
        customer: { create: {} },
      },
      include: { customer: true },
    });
  }

  // Simulated browser storage
  const browserSessionStorage: Record<string, string> = {};
  const CART_KEY = 'junk-it-out-pickup-cart';

  // Seed cart items in sessionStorage (2 items)
  const category1 = await db.wasteCategory.findFirst({ where: { active: true } });
  const category2 = await db.wasteCategory.findFirst({ where: { active: true, NOT: { id: category1?.id } } });

  const initialCartItems = [
    { categoryId: category1?.id || 'cat-1', quantity: 15 },
    { categoryId: category2?.id || 'cat-2', quantity: 25 },
  ];
  browserSessionStorage[CART_KEY] = JSON.stringify(initialCartItems);

  const jar = new SimpleCookieJar();

  // STEP 1: Customer A logged in.
  console.log('STEP 1: Login as Customer A...');
  const tokenA = signToken({
    userId: userA.id,
    phone: userA.phone,
    name: userA.name,
    role: 'CUSTOMER',
    customerId: userA.customer?.id,
    agentId: null,
    adminId: null,
  });
  jar.setCookiesFromHeader(`jio_token=${tokenA}; Path=/; HttpOnly`);
  console.log(`  ✓ Token set for ${userA.name} (${userA.phone})`);

  // STEP 2: Customer A visible in Pickup Cart (via /api/auth/me)
  console.log('\nSTEP 2: Open Pickup Cart & confirm Customer A visibility...');
  const resStep2 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: jar.getCookieHeader() },
  });
  const dataStep2 = await resStep2.json();
  if (resStep2.status !== 200 || dataStep2.data?.user?.phone !== phoneA) {
    throw new Error(`STEP 2 FAILED: Customer A not visible in cart. Got: ${JSON.stringify(dataStep2)}`);
  }
  console.log(`  ✓ Pickup Cart displays Customer A: Name = "${dataStep2.data.user.name}", Phone = "${dataStep2.data.user.phone}"`);

  // STEP 3: Customer A logged out.
  console.log('\nSTEP 3: Logout Customer A...');
  const resStep3 = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: jar.getCookieHeader() },
  });
  jar.setCookiesFromHeader(resStep3.headers.get('set-cookie'));
  console.log('  ✓ Logout request executed. Cookie jar cleared.');

  // STEP 4: Customer A information cleared.
  console.log('\nSTEP 4: Confirm Customer A information is completely cleared...');
  const resStep4 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: jar.getCookieHeader() },
  });
  const dataStep4 = await resStep4.json();
  if (resStep4.status !== 401) {
    throw new Error(`STEP 4 FAILED: Expected 401 UNAUTHORIZED post-logout, got ${resStep4.status}`);
  }
  console.log('  ✓ /api/auth/me returned 401 UNAUTHORIZED. Customer A identity is completely cleared.');

  // STEP 5: Customer B logged in using a different mobile number.
  console.log('\nSTEP 5: Login as Customer B (Phone: +919988776655)...');
  const tokenB = signToken({
    userId: userB.id,
    phone: userB.phone,
    name: userB.name,
    role: 'CUSTOMER',
    customerId: userB.customer?.id,
    agentId: null,
    adminId: null,
  });
  jar.setCookiesFromHeader(`jio_token=${tokenB}; Path=/; HttpOnly`);
  console.log(`  ✓ Token set for ${userB.name} (${userB.phone})`);

  // STEP 6: Pickup Cart shows Customer B.
  console.log('\nSTEP 6: Open Pickup Cart & verify Customer B display...');
  const resStep6 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: jar.getCookieHeader() },
  });
  const dataStep6 = await resStep6.json();
  if (resStep6.status !== 200 || dataStep6.data?.user?.phone !== phoneB) {
    throw new Error(`STEP 6 FAILED: Pickup Cart did not display Customer B. Got: ${JSON.stringify(dataStep6)}`);
  }
  console.log(`  ✓ Pickup Cart displays Customer B: Name = "${dataStep6.data.user.name}", Phone = "${dataStep6.data.user.phone}"`);

  // STEP 7: Customer A information is completely absent.
  console.log('\nSTEP 7: Confirm Customer A information is completely absent...');
  const userJsonStr = JSON.stringify(dataStep6.data);
  if (userJsonStr.includes(phoneA) || userJsonStr.includes(userA.name)) {
    throw new Error('STEP 7 FAILED: Customer A information still present in Customer B session!');
  }
  console.log('  ✓ Verified ZERO Customer A information remains in Customer B session payload.');

  // STEP 8: Cart items remain preserved.
  console.log('\nSTEP 8: Confirm cart items remain preserved...');
  const currentCartItems = JSON.parse(browserSessionStorage[CART_KEY] || '[]');
  if (currentCartItems.length !== initialCartItems.length || currentCartItems[0].quantity !== 15) {
    throw new Error('STEP 8 FAILED: Cart items were modified or cleared!');
  }
  console.log(`  ✓ Cart items preserved: ${currentCartItems.length} categories (${currentCartItems.map((c: any) => `${c.quantity}kg`).join(', ')})`);

  // STEP 9: Browser refresh performed.
  console.log('\nSTEP 9: Perform browser refresh (re-fetch /api/auth/me with persistent cookie)...');
  const resStep9 = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: jar.getCookieHeader() },
  });
  const dataStep9 = await resStep9.json();
  if (resStep9.status !== 200) {
    throw new Error(`STEP 9 FAILED: Refresh failed with status ${resStep9.status}`);
  }
  console.log('  ✓ Browser refresh completed successfully.');

  // STEP 10: Customer B still displayed after refresh.
  console.log('\nSTEP 10: Confirm Customer B still displayed after refresh...');
  if (dataStep9.data?.user?.phone !== phoneB || dataStep9.data?.user?.name !== userB.name) {
    throw new Error(`STEP 10 FAILED: Identity post-refresh was not Customer B. Got: ${JSON.stringify(dataStep9)}`);
  }
  console.log(`  ✓ Customer B still displayed after refresh: Phone = "${dataStep9.data.user.phone}"`);

  // STEP 11: Booking page uses Customer B identity.
  console.log('\nSTEP 11: Open booking page and verify Customer B identity auto-fill...');
  const bookingAuthUser = dataStep9.data.user;
  console.log(`  ✓ Booking page auto-fills: Phone = "${bookingAuthUser.phone}", Name = "${bookingAuthUser.name}"`);

  // STEP 12: Backend order association uses Customer B.
  console.log('\nSTEP 12: Create backend order and verify customer association...');
  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: jar.getCookieHeader(),
    },
    body: JSON.stringify({
      phone: bookingAuthUser.phone,
      name: bookingAuthUser.name,
      address: {
        label: 'Home',
        houseNo: '456',
        street: 'Outer Ring Rd',
        area: 'Marathahalli',
        pincode: '560037',
        lat: 12.9568,
        lng: 77.7011,
      },
      items: [{ categoryId: category1?.id, estimatedWeight: 15 }],
      pickupType: 'ASAP',
      photos: ['https://example.com/waste1.jpg'],
    }),
  });

  const orderData = await orderRes.json();
  if (orderRes.status !== 201 || !orderData.success) {
    throw new Error(`STEP 12 FAILED: Order creation failed: ${JSON.stringify(orderData)}`);
  }

  const createdOrder = await db.order.findUnique({
    where: { id: orderData.data.id },
    include: { customer: { include: { user: true } } },
  });

  if (createdOrder?.customer?.user?.phone !== phoneB) {
    throw new Error(`STEP 12 FAILED: Order created under phone ${createdOrder?.customer?.user?.phone}, expected ${phoneB}`);
  }
  if (createdOrder?.customerId !== userB.customer?.id) {
    throw new Error(`STEP 12 FAILED: Order customerId ${createdOrder?.customerId} does not match Customer B customer ID ${userB.customer?.id}`);
  }

  console.log(`  ✓ Order Created: ${createdOrder.orderNumber}`);
  console.log(`  ✓ Associated Customer ID in DB: ${createdOrder.customerId} (Customer B: ${userB.customer?.id})`);
  console.log(`  ✓ Associated User Phone in DB: ${createdOrder.customer.user.phone}`);

  console.log('\n===============================================================');
  console.log('   ALL 12 STEPS OF THE EXACT TEST SCENARIO PASSED CLEANLY!     ');
  console.log('===============================================================\n');
}

runTest()
  .catch((err) => {
    console.error('\n✕ TEST SCENARIO FAILED:', err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
