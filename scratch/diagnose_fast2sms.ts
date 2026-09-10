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

const SEND_URL = 'https://www.fast2sms.com/dev/otp/send';

async function diagnose() {
  const apiKey = process.env.FAST2SMS_API_KEY?.trim();
  const otpId = process.env.FAST2SMS_OTP_ID?.trim();

  console.log('=== FAST2SMS DIAGNOSTIC (NO SECRETS LOGGED) ===');
  console.log('FAST2SMS_API_KEY present:', Boolean(apiKey), 'Length:', apiKey?.length || 0);
  console.log('FAST2SMS_OTP_ID present:', Boolean(otpId), 'Length:', otpId?.length || 0);

  if (!apiKey || !otpId) {
    console.error('ERROR: Missing FAST2SMS configuration in environment!');
    return;
  }

  // Use a test phone number (e.g. 9189745120)
  const testMobile = '9189745120';

  console.log('\nTesting POST to:', SEND_URL);

  try {
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        mobile: testMobile,
        otp_id: otpId,
      }),
    });

    console.log('HTTP Status:', response.status, response.statusText);
    const text = await response.text();
    console.log('Raw Response text:', text);

    try {
      const data = JSON.parse(text);
      console.log('Parsed JSON metadata:');
      console.log('  return:', data.return);
      console.log('  request_id:', data.request_id ? '[PRESENT]' : '[NONE]');
      console.log('  status_code:', data.status_code);
      console.log('  message:', data.message);
    } catch {
      console.log('Response is not valid JSON.');
    }
  } catch (err: any) {
    console.error('Fetch error:', err.message);
  }
}

diagnose();
