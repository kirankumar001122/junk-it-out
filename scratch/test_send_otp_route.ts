async function testSendOtpRoute() {
  console.log('Calling POST http://localhost:3000/api/auth/send-otp ...');
  try {
    const res = await fetch('http://localhost:3000/api/auth/send-otp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000', // Trusted origin
      },
      body: JSON.stringify({ phone: '9189745120' }),
    });

    console.log('HTTP Status:', res.status, res.statusText);
    const data = await res.json();
    console.log('Response JSON:', data);
  } catch (err: any) {
    console.error('Fetch error:', err.message);
  }
}

testSendOtpRoute();
