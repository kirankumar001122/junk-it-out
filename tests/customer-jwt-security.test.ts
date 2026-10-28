import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../lib/auth/jwt';
import { JwtConfigurationError } from '../lib/auth/jwtSecret';

function expectConfigurationError(operation: () => unknown) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof JwtConfigurationError, 'Must be instance of JwtConfigurationError');
    assert.match(error.message, /JWT_SECRET.*at least 32 bytes/, 'Must state at least 32 bytes requirement');
    return true;
  });
}

async function testCustomerJwtSecurity() {
  const env = process.env as Record<string, string | undefined>;
  const originalSecret = env.JWT_SECRET;
  const originalRazorpay = env.RAZORPAY_SECRET;

  try {
    // 1. Missing JWT_SECRET throws JwtConfigurationError
    delete env.JWT_SECRET;
    env.RAZORPAY_SECRET = 'payment-secret-must-not-be-used-as-jwt-secret';
    expectConfigurationError(() => signToken({ userId: 'cust-1', phone: '9999911111', role: 'CUSTOMER' }));
    expectConfigurationError(() => verifyToken('any.valid.looking.token'));

    // 2. Secret with less than 32 bytes throws JwtConfigurationError
    env.JWT_SECRET = 'too-short-secret-under-32-b'; // 27 bytes
    expectConfigurationError(() => signToken({ userId: 'cust-1', phone: '9999911111', role: 'CUSTOMER' }));
    expectConfigurationError(() => verifyToken('any.valid.looking.token'));

    // 3. Valid secret (>= 32 bytes) successfully signs and verifies
    env.JWT_SECRET = 'valid-production-grade-jwt-secret-with-more-than-32-bytes';
    const payload = {
      userId: 'customer-uid-101',
      phone: '9876543210',
      role: 'CUSTOMER' as const,
      customerId: 'cust-prof-202',
    };
    const token = signToken(payload, 7);
    assert.ok(typeof token === 'string' && token.split('.').length === 3);

    const verified = verifyToken(token);
    assert.ok(verified !== null);
    assert.equal(verified.userId, 'customer-uid-101');
    assert.equal(verified.phone, '9876543210');
    assert.equal(verified.role, 'CUSTOMER');
    assert.equal(verified.customerId, 'cust-prof-202');

    // 4. Tampered signature is rejected (returns null)
    const tampered = token.slice(0, -3) + 'xyz';
    assert.equal(verifyToken(tampered), null);

    // 5. Malformed tokens are rejected (returns null)
    assert.equal(verifyToken('malformed'), null);
    assert.equal(verifyToken('a.b'), null);

    // 6. Expired token is rejected (returns null)
    const expiredToken = signToken(payload, -1);
    assert.equal(verifyToken(expiredToken), null);

    console.log('Customer JWT security & configuration validation tests passed.');
  } finally {
    if (originalSecret !== undefined) env.JWT_SECRET = originalSecret;
    else delete env.JWT_SECRET;
    if (originalRazorpay !== undefined) env.RAZORPAY_SECRET = originalRazorpay;
    else delete env.RAZORPAY_SECRET;
  }
}

void testCustomerJwtSecurity().catch((err) => {
  console.error('Customer JWT security test failed:', err);
  process.exit(1);
});
