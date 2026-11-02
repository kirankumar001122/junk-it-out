import assert from 'node:assert/strict';
import { signToken, verifyToken } from '../lib/auth/jwt';
import { verifyToken as verifyAdminToken } from '../apps/admin/lib/auth/jwt';
import { JwtConfigurationError } from '../lib/auth/jwtSecret';

function expectConfigurationError(operation: () => unknown) {
  assert.throws(operation, (error: unknown) => {
    assert.ok(error instanceof JwtConfigurationError);
    assert.match(error.message, /JWT_SECRET.*at least 32 bytes/);
    return true;
  });
}

try {
  // Explicitly prove payment credentials are not accepted as session keys.
  process.env.RAZORPAY_SECRET = 'test-only-payment-secret-one';
  process.env.PAYMENT_KEY_SECRET = 'test-only-payment-secret-two';
  delete process.env.JWT_SECRET;
  expectConfigurationError(() => signToken({ userId: 'customer-1', phone: 'test', role: 'CUSTOMER' }));
  expectConfigurationError(() => verifyToken('not.a.token'));
  expectConfigurationError(() => verifyAdminToken('not.a.token'));

  process.env.JWT_SECRET = 'too-short-for-a-session-key';
  expectConfigurationError(() => signToken({ userId: 'customer-1', phone: 'test', role: 'CUSTOMER' }));

  process.env.JWT_SECRET = 'test-only-jwt-secret-with-more-than-32-bytes';
  const token = signToken({
    userId: 'customer-1',
    phone: 'test-only',
    role: 'CUSTOMER',
    customerId: 'customer-profile-1',
  });

  const verified = verifyToken(token);
  assert.equal(verified?.userId, 'customer-1');
  assert.equal(verified?.role, 'CUSTOMER');
  assert.equal(verified?.customerId, 'customer-profile-1');
  assert.equal(verifyAdminToken(token)?.userId, 'customer-1', 'admin app uses the same JWT_SECRET and token format');

  const alteredSignature = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
  assert.equal(verifyToken(alteredSignature), null, 'a token with an invalid signature is rejected');
  assert.equal(verifyToken('malformed-token'), null, 'a malformed token is rejected');

  process.env.JWT_SECRET = 'a-different-valid-test-only-jwt-secret';
  assert.equal(verifyToken(token), null, 'tokens signed under a different configured key are rejected');

  console.log('JWT configuration, signing, verification, and invalid-token tests passed.');
} finally {
  delete process.env.JWT_SECRET;
  delete process.env.RAZORPAY_SECRET;
  delete process.env.PAYMENT_KEY_SECRET;
}
