const BASE_URL = 'http://localhost:3000';

async function testFast2SmsFlow() {
  console.log('=== FAST2SMS OTP SERVICE INTEGRATION TEST ===');

  const testPhone = '9189745120';

  // 1. Send OTP Request
  console.log('\n1. Testing POST /api/auth/send-otp with mobile number...');
  const sendRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ phone: testPhone }),
  });
  const sendData = await sendRes.json();
  console.log('Send OTP status:', sendRes.status, sendData);

  if (sendRes.status !== 200 || !sendData.success) {
    throw new Error(`Send OTP failed with status ${sendRes.status}: ${JSON.stringify(sendData)}`);
  }
  console.log('  ✓ [PASS] Fast2SMS OTP sent successfully.');

  // 2. Cooldown Rate Limit Test
  console.log('\n2. Testing resend cooldown rate-limiting...');
  const immediateRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ phone: testPhone }),
  });
  const immediateData = await immediateRes.json();
  console.log('Immediate resend status:', immediateRes.status, immediateData);

  if (immediateRes.status !== 429 || immediateData.error?.code !== 'RATE_LIMIT_EXCEEDED') {
    throw new Error(`Expected 429 RATE_LIMIT_EXCEEDED during cooldown but got ${immediateRes.status}`);
  }
  console.log('  ✓ [PASS] Resend cooldown active and enforced (429 RATE_LIMIT_EXCEEDED).');

  // 3. Invalid Phone Number Test
  console.log('\n3. Testing invalid phone number validation...');
  const invalidRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
    body: JSON.stringify({ phone: '123' }),
  });
  const invalidData = await invalidRes.json();
  console.log('Invalid phone status:', invalidRes.status, invalidData);

  if (invalidRes.status !== 400 || invalidData.error?.code !== 'INVALID_PHONE') {
    throw new Error(`Expected 400 INVALID_PHONE but got ${invalidRes.status}`);
  }
  console.log('  ✓ [PASS] Invalid phone number rejected (400 INVALID_PHONE).');

  console.log('\n=== ALL FAST2SMS OTP TESTS PASSED! ===');
}

testFast2SmsFlow().catch((e) => {
  console.error('Test failed:', e);
  process.exit(1);
});
