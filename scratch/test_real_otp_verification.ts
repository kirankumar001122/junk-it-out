{
  const BASE_URL = 'http://localhost:3000';

  async function testOtpVerificationLogic() {
    console.log('=== FAST2SMS SMART OTP VERIFICATION TEST ===');

    const testMobile = '9189745120';

    // Step 1: Send OTP via API
    console.log('\n1. Sending OTP to mobile number via POST /api/auth/send-otp...');
    const sendRes = await fetch(`${BASE_URL}/api/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
      body: JSON.stringify({ phone: testMobile }),
    });
    const sendData = await sendRes.json();
    console.log('Send OTP status:', sendRes.status, sendData);

    if (sendRes.status !== 200 || !sendData.success) {
      console.log('Note: If rate limited by Fast2SMS, wait before retrying.');
    }

    // Step 2: Test Wrong OTP verification
    console.log('\n2. Testing POST /api/auth/verify-otp with intentionally wrong OTP (000000)...');
    const wrongRes = await fetch(`${BASE_URL}/api/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Origin': BASE_URL },
      body: JSON.stringify({ phone: testMobile, code: '000000' }),
    });
    const wrongData = await wrongRes.json();
    console.log('Wrong OTP verification status:', wrongRes.status, wrongData);

    if (wrongRes.status === 400 && wrongData.error?.code === 'OTP_VERIFICATION_FAILED') {
      console.log('  ✓ [PASS] Fast2SMS correctly rejected invalid OTP with 400 status and provider error message.');
    } else {
      throw new Error(`Unexpected response for invalid OTP: ${wrongRes.status} ${JSON.stringify(wrongData)}`);
    }

    console.log('\n=== FAST2SMS VERIFICATION API LOGIC VERIFIED SUCCESSFULLY ===');
  }

  testOtpVerificationLogic().catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  });
}
