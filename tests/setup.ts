if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/junk_it_out_test';
}

if (!process.env.DIRECT_URL) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'vitest-only-secret';
}

if (!process.env.RAZORPAY_KEY_ID) {
  process.env.RAZORPAY_KEY_ID = 'rzp_test_vitest';
}
