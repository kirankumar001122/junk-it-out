import assert from 'node:assert/strict';
import { test } from 'node:test';
import { signToken, verifyToken } from '../../lib/auth/jwt.ts';

test('JWT sessions require a configured secret and reject expired tokens', () => {
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'unit-test-only-signing-key-not-a-real-credential';

  try {
    const payload = {
      userId: 'test-user',
      phone: '+911234567890',
      role: 'CUSTOMER',
      customerId: 'test-customer',
      agentId: null,
      adminId: null,
    };

    const validToken = signToken(payload);
    assert.equal(verifyToken(validToken)?.userId, payload.userId);

    const expiredToken = signToken(payload, -1);
    assert.equal(verifyToken(expiredToken), null);

    delete process.env.JWT_SECRET;
    assert.throws(() => signToken(payload), /JWT_SECRET must be configured/);
  } finally {
    if (originalSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = originalSecret;
  }
});
