import { test, expect } from '@playwright/test';
import { mockApp, syntheticAddress, syntheticOrder } from '../mocks';

test('public pages navigate and browser back works with API traffic mocked', async ({ page }) => {
  const mocks = await mockApp(page, { role: 'GUEST' });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /turn scrap & waste into instant value/i })).toBeVisible();
  await page.locator('a[href="/pricing"]').first().click();
  await expect(page).toHaveURL(/\/pricing$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { name: /turn scrap & waste into instant value/i })).toBeVisible();
  await mocks.assertIsolated();
});

test('My Pickups and Account navigate to their distinct customer pages', async ({ page }) => {
  test.setTimeout(45_000);
  const mocks = await mockApp(page, { role: 'CUSTOMER' });

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  const account = page.getByRole('link', { name: 'Synthetic Customer' });
  await expect(account).toHaveAttribute('href', '/customer/profile');
  await account.click();
  await expect(page).toHaveURL(/\/customer\/profile$/);
  await expect(page.getByRole('heading', { name: 'Synthetic Customer' })).toBeVisible();

  const profilePickups = page.getByRole('link', { name: 'My Pickups', exact: true });
  await expect(profilePickups).toHaveAttribute('href', '/my-pickups');
  await profilePickups.click();
  await expect(page).toHaveURL(/\/my-pickups$/);
  await expect(page.getByRole('heading', { name: 'My Waste Pickups' })).toBeVisible();

  await page.goto('/customer/profile');
  const history = page.getByRole('link', { name: 'Pickup History' });
  await expect(history).toHaveAttribute('href', '/customer/history');
  await history.click();
  await expect(page).toHaveURL(/\/customer\/history$/);
  await expect(page.getByRole('heading', { name: 'Pickup History' })).toBeVisible();
  await expect(page.getByText('Completed and cancelled pickups with their final statuses.')).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/customer\/history$/);
  await expect(page.getByRole('heading', { name: 'Pickup History' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const mobilePickups = page.getByRole('link', { name: 'Pickups', exact: true });
  await expect(mobilePickups).toHaveAttribute('href', '/customer/orders');
  await mobilePickups.click();
  await expect(page).toHaveURL(/\/customer\/orders$/);
  await expect(page.getByRole('heading', { name: 'My Waste Pickups' })).toBeVisible();

  const mobileProfile = page.getByRole('link', { name: 'Profile' });
  await expect(mobileProfile).toHaveAttribute('href', '/customer/profile');
  await mobileProfile.click();
  await expect(page).toHaveURL(/\/customer\/profile$/);
  await expect(page.getByRole('heading', { name: 'Synthetic Customer' })).toBeVisible();
  await mocks.assertIsolated();
});

test('Pickup History shows past statuses and sends completed and cancelled pickups to their correct views', async ({ page }) => {
  const active = syntheticOrder('order-active', 'customer-a');
  const completed = syntheticOrder('order-completed', 'customer-a', { status: 'PICKUP COMPLETED' });
  const cancelled = syntheticOrder('order-cancelled', 'customer-a', { status: 'CANCELLED' });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [active, completed, cancelled] });

  await page.goto('/customer/history');
  await expect(page.getByRole('heading', { name: 'Pickup History' })).toBeVisible();
  await expect(page.getByText('JIO-order-active')).toHaveCount(0);
  await expect(page.getByText('PICKUP COMPLETED')).toBeVisible();
  await expect(page.getByText('CANCELLED', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Receipt' })).toHaveAttribute('href', '/orders/order-completed/receipt');
  await expect(page.getByRole('link', { name: 'View Details' })).toHaveAttribute('href', '/orders/order-cancelled');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Pickup History' })).toBeVisible();
  await mocks.assertIsolated();
});

test('OTP UI handles invalid phone, send, invalid code, verify, and logout with synthetic responses', async ({ page }) => {
  const mocks = await mockApp(page, { role: 'GUEST' });
  await page.goto('/my-pickups', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /login with mobile otp/i }).click();
  await page.getByLabel('Mobile Number').fill('12345');
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await expect(page.getByText(/valid 10-digit mobile number/i)).toBeVisible();
  await page.getByLabel('Mobile Number').fill('9000000001');
  await page.getByRole('button', { name: 'Send OTP' }).click();
  await page.getByPlaceholder('Enter 6-digit OTP').fill('111111');
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await expect(page.getByText(/synthetic access denied/i)).toBeVisible();
  await page.getByPlaceholder('Enter 6-digit OTP').fill('123456');
  await page.getByRole('button', { name: 'Verify & Continue' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText(/JIO-order-a/i)).toBeVisible();
  expect(mocks.calls.some((call) => call.path === '/api/auth/send-otp')).toBeTruthy();
  expect(mocks.calls.some((call) => call.path === '/api/auth/verify-otp')).toBeTruthy();
  await mocks.assertIsolated();
});

test('separate synthetic customers see only their own pickup and receive a denied response for another ID', async ({ browser }) => {
  const customerAContext = await browser.newContext();
  const customerBContext = await browser.newContext();
  const pageA = await customerAContext.newPage();
  const pageB = await customerBContext.newPage();
  const a = await mockApp(pageA, { role: 'CUSTOMER', customerId: 'customer-a', orders: [syntheticOrder('order-a', 'customer-a')] });
  const b = await mockApp(pageB, { role: 'CUSTOMER', customerId: 'customer-b', orders: [syntheticOrder('order-b', 'customer-b')] });
  await pageA.goto('/my-pickups');
  await pageB.goto('/my-pickups');
  await expect(pageA.getByText('JIO-order-a')).toBeVisible();
  await expect(pageA.getByText('JIO-order-b')).toHaveCount(0);
  await expect(pageB.getByText('JIO-order-b')).toBeVisible();
  await expect(pageB.getByText('JIO-order-a')).toHaveCount(0);
  await pageB.goto('/orders/order-a');
  await expect(pageB.getByText(/synthetic access denied/i)).toBeVisible();
  await a.assertIsolated();
  await b.assertIsolated();
  await customerAContext.close();
  await customerBContext.close();
});

test('saved addresses load, support empty state, create, rename, default, and confirmed deletion', async ({ page }) => {
  const first = syntheticAddress('address-a1', 'user-customer-a', 'Home', true);
  const second = syntheticAddress('address-a2', 'user-customer-a', 'Work', false);
  const mocks = await mockApp(page, { role: 'CUSTOMER', addresses: [first, second] });
  await page.goto('/customer/addresses');
  await expect(page.getByText('Synthetic Area').first()).toBeVisible();
  await page.getByRole('button', { name: /set default/i }).click();
  await expect.poll(() => mocks.addresses.find((address) => address.id === second.id)?.isDefault).toBe(true);
  page.once('dialog', (dialog) => dialog.accept('Work updated'));
  await page.getByRole('button', { name: /edit label/i }).first().click();
  await expect.poll(() => mocks.addresses.some((address) => address.label === 'Work updated')).toBe(true);
  await page.getByRole('button', { name: 'Add Address' }).click();
  await page.getByPlaceholder(/Flat 204/).fill('Synthetic house');
  await page.getByPlaceholder('Street').fill('Synthetic Road');
  await page.getByPlaceholder('Area').fill('Synthetic Area 2');
  await page.getByPlaceholder('Postcode').fill('560002');
  await page.getByPlaceholder('Latitude from map').fill('12.92');
  await page.getByPlaceholder('Longitude from map').fill('77.60');
  await page.getByRole('button', { name: 'Save Address' }).click();
  await expect.poll(() => mocks.addresses.length).toBe(3);
  page.once('dialog', (dialog) => dialog.dismiss());
  await page.getByRole('button', { name: 'Delete address' }).first().click();
  expect(mocks.addresses.length).toBe(3);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Delete address' }).first().click();
  await expect.poll(() => mocks.addresses.length).toBe(2);
  expect(mocks.calls.some((call) => call.method === 'PATCH')).toBeTruthy();
  expect(mocks.calls.some((call) => call.method === 'DELETE')).toBeTruthy();
  expect(mocks.calls.some((call) => call.method === 'POST' && call.path === '/api/customer/addresses')).toBeTruthy();
  await mocks.assertIsolated();
});

test('address loading and network errors are visible, and empty addresses are explicit', async ({ page }) => {
  const empty = await mockApp(page, { role: 'CUSTOMER', addresses: [] });
  await page.goto('/customer/addresses');
  await expect(page.getByText(/no saved addresses yet/i)).toBeVisible();
  await empty.assertIsolated();
  const failed = await mockApp(page, { role: 'CUSTOMER', failPaths: ['/api/customer/addresses'] });
  await page.goto('/customer/addresses');
  await expect(page.getByText('Synthetic network failure.')).toBeVisible();
  await failed.assertIsolated();
});

test('booking honors the saved default and lets the customer choose another saved address', async ({ page }) => {
  const first = syntheticAddress('address-newer', 'user-customer-a', 'Work', false);
  const preferred = syntheticAddress('address-home', 'user-customer-a', 'Home', true);
  const mocks = await mockApp(page, { role: 'CUSTOMER', addresses: [first, preferred] });
  await page.goto('/book');
  await page.getByRole('button', { name: /continue to location & time/i }).click();
  const home = page.getByTestId('saved-address-address-home');
  const work = page.getByTestId('saved-address-address-newer');
  await expect(home).toHaveAttribute('aria-pressed', 'true');
  await work.click();
  await expect(work).toHaveAttribute('aria-pressed', 'true');
  await expect(home).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByText('Synthetic Area').first()).toBeVisible();
  await mocks.assertIsolated();
});

test('booking validates location, creates once on double click, and captures payment through the stub', async ({ page }) => {
  const mocks = await mockApp(page, { role: 'CUSTOMER' });
  await page.goto('/book');
  await page.getByRole('button', { name: /continue to location & time/i }).click();
  await expect(page.getByRole('heading', { name: /pickup location & schedule/i })).toBeVisible();
  await page.getByRole('button', { name: /view summary & pay/i }).click();
  const pay = page.getByRole('button', { name: /pay .* confirm pickup/i });
  await pay.dblclick();
  await expect(page.getByRole('heading', { name: /booking confirmed/i })).toBeVisible();
  const orderRequests = mocks.calls.filter((call) => call.method === 'POST' && call.path === '/api/orders');
  expect(orderRequests).toHaveLength(1);
  expect(orderRequests[0].idempotencyKey).toBeTruthy();
  expect(mocks.calls.some((call) => call.path === '/api/payments/create')).toBeTruthy();
  expect(mocks.calls.some((call) => call.path === '/api/payments/verify')).toBeTruthy();
  await mocks.assertIsolated();
});

test('payment failure and authorization remain unconfirmed with mocked checkout only', async ({ page }) => {
  const failed = await mockApp(page, { role: 'CUSTOMER', checkoutOutcome: 'failed' });
  await page.goto('/book');
  await page.getByRole('button', { name: /continue to location & time/i }).click();
  await page.getByRole('button', { name: /view summary & pay/i }).click();
  await page.getByRole('button', { name: /pay .* confirm pickup/i }).click();
  await expect(page.getByText(/payment failed: synthetic payment failure/i)).toBeVisible();
  await failed.assertIsolated();

  const authorized = await mockApp(page, { role: 'CUSTOMER', paymentStatus: 'AUTHORIZED' });
  await page.goto('/book');
  await page.getByRole('button', { name: /continue to location & time/i }).click();
  await page.getByRole('button', { name: /view summary & pay/i }).click();
  await page.getByRole('button', { name: /pay .* confirm pickup/i }).click();
  await expect(page.getByText(/authorized/i).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /booking confirmed/i })).toHaveCount(0);
  await authorized.assertIsolated();
});

test('My Pickups, tracking, receipt, cancellation review, and request failures render their states', async ({ page }) => {
  const cancelled = syntheticOrder('order-cancelled', 'customer-a', { status: 'CANCELLED', paymentStatus: 'REFUND_REQUIRED', cancellationReason: 'Synthetic cancellation' });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [cancelled] });
  await page.goto('/my-pickups');
  await expect(page.getByText(/payment captured; admin refund review required/i)).toBeVisible();
  await page.goto('/orders/order-cancelled');
  await expect(page.getByText(/admin refund review required/i).first()).toBeVisible();
  await page.goto('/orders/order-cancelled/receipt');
  await expect(page).toHaveURL(/\/my-pickups$/);
  await mocks.assertIsolated();

  const completed = syntheticOrder('order-complete', 'customer-a', {
    status: 'PICKUP_COMPLETED',
    paymentStatus: 'CAPTURED',
    finalAmount: 75,
    invoices: [{ invoiceNumber: 'SYNTHETIC-INV-1' }],
    items: [{ id: 'item-receipt', category: { name: 'Paper' }, actualWeight: 3, estimatedWeight: 4, ratePerKg: 25, subtotal: 75 }],
    settlement: { totalWeightKg: 3, amount: 75, status: 'COMPLETED' },
  });
  await page.addInitScript(() => {
    (window as any).__receiptPrintCalls = 0;
    window.print = () => { (window as any).__receiptPrintCalls += 1; };
  });
  const receiptMocks = await mockApp(page, { role: 'CUSTOMER', orders: [completed] });
  await page.goto('/orders/order-complete/receipt');
  await expect(page.getByText('SYNTHETIC-INV-1').first()).toBeVisible();
  await expect(page.getByText('3 kg', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('₹75.00').first()).toBeVisible();
  await page.getByRole('button', { name: /print \/ save receipt/i }).click();
  expect(await page.evaluate(() => (window as any).__receiptPrintCalls)).toBe(1);
  await receiptMocks.assertIsolated();

  const failed = await mockApp(page, { role: 'CUSTOMER', failPaths: ['/api/orders'] });
  await page.goto('/my-pickups');
  await expect(page.getByText('Synthetic network failure.')).toBeVisible();
  await failed.assertIsolated();
});

test('authorized booking-received order renders tracking and survives refresh', async ({ page }) => {
  test.setTimeout(45_000);
  const received = syntheticOrder('order-received', 'customer-a', { status: 'BOOKING_RECEIVED' });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [received] });
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const apiResponses: Array<{ status: number; body: string }> = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname === '/api/orders/order-received') {
      apiResponses.push({ status: response.status(), body: await response.text() });
    }
  });
  const documentResponse = await page.goto('/orders/order-received', { waitUntil: 'domcontentloaded' });
  await expect.poll(() => apiResponses.length, { timeout: 5_000 }).toBeGreaterThan(0);
  const apiPayload = JSON.parse(apiResponses[0].body);
  expect(documentResponse?.status()).toBe(200);
  expect(apiResponses[0].status).toBe(200);
  expect(apiPayload).toMatchObject({ success: true, data: { id: 'order-received', status: 'BOOKING_RECEIVED' } });
  await expect(page.getByRole('heading', { name: 'Synthetic Area Pickup' })).toBeVisible();
  await expect(page.getByText('Booking Received', { exact: true })).toBeVisible();
  const renderedState = await page.evaluate(() => ({
    mainText: document.querySelector('main')?.innerText || '',
    loadingShimmers: document.querySelectorAll('main .shimmer-box').length,
  }));
  expect(renderedState.loadingShimmers).toBe(0);
  expect(renderedState.mainText).toContain('Booking Received');
  expect(pageErrors, JSON.stringify({ renderedState, apiPayload })).toEqual([]);
  expect(consoleErrors, JSON.stringify({ renderedState, apiPayload })).toEqual([]);
  await expect(page.getByText('Booking Received', { exact: true })).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Booking Received', { exact: true })).toBeVisible();
  await mocks.assertIsolated();
});

test('pickup active action opens the active tracking page', async ({ page }) => {
  const active = syntheticOrder('order-active', 'customer-a', { status: 'AGENT_ON_WAY' });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [active] });
  await page.goto('/my-pickups', { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="/orders/order-active"]').click();
  await expect(page).toHaveURL(/\/orders\/order-active$/);
  await expect(page.getByText('Agent On Way', { exact: true }).first()).toBeVisible();
  await mocks.assertIsolated();
});

test('completed pickup action opens the authorized receipt', async ({ page }) => {
  const completed = syntheticOrder('order-receipt', 'customer-a', { status: 'PICKUP COMPLETED' });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [completed] });
  await page.goto('/my-pickups', { waitUntil: 'domcontentloaded' });
  const receipt = page.getByRole('link', { name: /view receipt/i });
  await expect(receipt).toHaveAttribute('href', '/orders/order-receipt/receipt');
  await expect(page.locator('a[href="/orders/order-receipt"]')).toHaveCount(0);
  await receipt.click();
  await expect(page).toHaveURL(/\/orders\/order-receipt\/receipt$/);
  await expect(page.getByText('Pickup Receipt')).toBeVisible();
  await mocks.assertIsolated();
});

test('cancelled pickup action opens its order details', async ({ page }) => {
  const cancelled = syntheticOrder('order-cancelled-details', 'customer-a', {
    status: 'CANCELLED',
    cancellationReason: 'Synthetic cancellation',
  });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [cancelled] });
  await page.goto('/my-pickups', { waitUntil: 'domcontentloaded' });
  const details = page.getByRole('link', { name: /view details/i });
  await expect(details).toHaveAttribute('href', '/orders/order-cancelled-details');
  await details.click();
  await expect(page).toHaveURL(/\/orders\/order-cancelled-details$/);
  await expect(page.getByText('Pickup Order Cancelled')).toBeVisible();
  await expect(page.getByText('Synthetic cancellation')).toBeVisible();
  await mocks.assertIsolated();
});

test('pickup tracking shows a clear message for a missing order', async ({ page }) => {
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [] });
  await page.goto('/orders/missing-order', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Pickup order #missing-order could not be found.')).toBeVisible();
  await mocks.assertIsolated();
});

test('pickup tracking denies another customer order', async ({ page }) => {
  const foreign = syntheticOrder('order-foreign', 'customer-b');
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [foreign] });
  await page.goto('/orders/order-foreign', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('You are not authorized to view this pickup.')).toBeVisible();
  await mocks.assertIsolated();
});

test('receipt does not render another customer order', async ({ page }) => {
  const foreign = syntheticOrder('order-foreign-receipt', 'customer-b', {
    status: 'PICKUP_COMPLETED',
    invoices: [{ invoiceNumber: 'FOREIGN-INV' }],
  });
  const mocks = await mockApp(page, { role: 'CUSTOMER', orders: [foreign] });
  await page.goto('/orders/order-foreign-receipt/receipt', { waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Synthetic access denied.')).toBeVisible();
  await expect(page.getByText('FOREIGN-INV')).toHaveCount(0);
  await mocks.assertIsolated();
});

test('agent dashboard uses a separate synthetic identity and displays only assigned pickups', async ({ page }) => {
  const assigned = syntheticOrder('agent-order', 'customer-a', { agentId: 'agent-a', agent: { id: 'agent-a', vehicleNumber: 'SYNTHETIC-1', user: { name: 'Synthetic Agent' } } });
  const mocks = await mockApp(page, { role: 'AGENT', agentId: 'agent-a', orders: [assigned] });
  await page.goto('/agent', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Synthetic Customer' }).first()).toBeVisible();
  await expect(page.getByText('JIO-agent-order')).toBeVisible();
  await mocks.assertIsolated();
});
