import fs from 'fs';
import path from 'path';

function loadEnv() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const idx = trimmed.indexOf('=');
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnv();

const VERIFY_URL = 'https://www.fast2sms.com/dev/otp/verify';

async function diagnoseVerify() {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  const otpId = process.env.FAST2SMS_OTP_ID?.trim();

  console.log('=== FAST2SMS VERIFY DIAGNOSTIC ===');
  console.log('API key present:', Boolean(apiKey));
  console.log('OTP ID present:', Boolean(otpId));

  const testMobile = '9189745120';
  const dummyOtp = '123456';

  // Test 1: With mobile and otp ONLY (Fast2SMS Smart OTP spec)
  console.log('\n--- Test 1: { mobile, otp } ---');
  try {
    const res1 = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey || '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobile: testMobile, otp: dummyOtp }),
    });
    console.log('Status 1:', res1.status, res1.statusText);
    const text1 = await res1.text();
    console.log('Response 1:', text1);
  } catch (err: any) {
    console.error('Error 1:', err.message);
  }

  // Test 2: With mobile, otp_id, and otp
  console.log('\n--- Test 2: { mobile, otp_id, otp } ---');
  try {
    const res2 = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey || '',
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mobile: testMobile, otp_id: otpId, otp: dummyOtp }),
    });
    console.log('Status 2:', res2.status, res2.statusText);
    const text2 = await res2.text();
    console.log('Response 2:', text2);
  } catch (err: any) {
    console.error('Error 2:', err.message);
  }
}

diagnoseVerify();
