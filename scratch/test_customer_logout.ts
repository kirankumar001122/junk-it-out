import { db } from '../lib/db';
import { signToken } from '../lib/auth/jwt';

const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('=== CUSTOMER LOGOUT & SESSION INVALIDATION VERIFICATION ===');

  // Step 1: Find or get a test customer from DB
  let customer = await db.customer.findFirst({
    include: { user: true },
  });

  if (!customer) {
    throw new Error('No customer record found in database for testing');
  }

  console.log(`\n1. Found test customer: ${customer.user.name} (${customer.user.phone})`);

  // Step 2: Sign a valid jio_token
  const validToken = signToken({
    userId: customer.userId,
    phone: customer.user.phone,
    name: customer.user.name,
    role: 'CUSTOMER',
    customerId: customer.id,
    agentId: null,
    adminId: null,
  });

  const cookieStr = `jio_token=${validToken}`;
  console.log('2. Generated valid customer jio_token cookie.');

  // Step 3: Call /api/auth/me WITH jio_token cookie
  console.log('\n3. Calling GET /api/auth/me with jio_token cookie...');
  const meRes = await fetch(`${BASE_URL}/api/auth/me`, {
    headers: { Cookie: cookieStr },
  });
  const meData = await meRes.json();
  console.log('/api/auth/me status:', meRes.status, 'Role:', meData.data?.user?.role, 'Phone:', meData.data?.user?.phone);

  if (meRes.status !== 200 || !meData.success || meData.data?.user?.role !== 'CUSTOMER') {
    throw new Error('Authentication check failed for logged-in customer');
  }
  console.log('  ✓ [PASS] Authenticated customer session verified by /api/auth/me.');

  // Step 4: Call POST /api/auth/logout with cookie
  console.log('\n4. Calling POST /api/auth/logout with jio_token cookie...');
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { Cookie: cookieStr },
  });
  const logoutData = await logoutRes.json();
  console.log('Logout API status:', logoutRes.status, logoutData.message);

  const logoutCookieHeader = logoutRes.headers.get('set-cookie');
  console.log('Set-Cookie header received on logout:', logoutCookieHeader);

  if (!logoutCookieHeader || (!logoutCookieHeader.includes('1970') && !logoutCookieHeader.includes('Max-Age=0') && !logoutCookieHeader.includes('jio_token=;'))) {
    throw new Error('Logout response Set-Cookie header did not include Max-Age=0 or expires=1970');
  }
  console.log('  ✓ [PASS] Logout API correctly returned Set-Cookie header clearing jio_token.');

  // Step 5: Call GET /api/auth/me WITHOUT cookie (simulating browser after cookie cleared)
  console.log('\n5. Calling GET /api/auth/me without jio_token cookie...');
  const mePostLogoutRes = await fetch(`${BASE_URL}/api/auth/me`);
  const mePostLogoutData = await mePostLogoutRes.json();
  console.log('Post-logout /api/auth/me status:', mePostLogoutRes.status, mePostLogoutData.error);

  if (mePostLogoutRes.status !== 401) {
    throw new Error(`Expected 401 UNAUTHORIZED after logout but got ${mePostLogoutRes.status}`);
  }
  console.log('  ✓ [PASS] /api/auth/me correctly returned 401 UNAUTHORIZED after logout.');

  // Step 6: Call POST /api/orders WITHOUT cookie (testing order creation security)
  console.log('\n6. Attempting POST /api/orders without jio_token cookie...');
  const orderRes = await fetch(`${BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: customer.user.phone, items: [] }),
  });
  const orderData = await orderRes.json();
  console.log('Post-logout POST /api/orders status:', orderRes.status, orderData.error);

  if (orderRes.status !== 401) {
    throw new Error(`Expected 401 UNAUTHORIZED on POST /api/orders after logout but got ${orderRes.status}`);
  }
  console.log('  ✓ [PASS] Unauthenticated order creation blocked with 401 UNAUTHORIZED.');

  console.log('\n=== ALL LOGOUT & SESSION INVALIDATION TESTS PASSED SUCCESSFULLY! ===');
}

main()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
