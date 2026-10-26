import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { verifyToken as verifyAdminToken } from '../apps/admin/lib/auth/jwt';
import { signToken, verifyToken as verifyRootToken } from '../lib/auth/jwt';

function tokenSignedWith(
  secret: string,
  payload: Record<string, unknown> = {
    userId: 'test-user',
    phone: 'test-only',
    role: 'ADMIN',
    exp: Date.now() / 1000 + 60,
  },
): string {
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}`;
  const signature = createHmac('sha256', secret).update(input).digest('base64url');
  return `${input}.${signature}`;
}

describe('admin JWT configuration', () => {
  afterEach(() => vi.unstubAllEnvs());

  test('verifies tokens signed by the shared dedicated JWT_SECRET', () => {
    vi.stubEnv('JWT_SECRET', 'ci-only-dedicated-jwt-secret-32-bytes');

    const token = signToken({ userId: 'test-user', phone: 'test-only', role: 'ADMIN' });

    expect(verifyAdminToken(token)?.role).toBe('ADMIN');
    expect(verifyRootToken(token)?.role).toBe('ADMIN');
  });

  test.each(['', 'short-secret'])('fails closed when JWT_SECRET is %j', (jwtSecret) => {
    vi.stubEnv('JWT_SECRET', jwtSecret);
    vi.stubEnv('RAZORPAY_SECRET', 'payment-secret-that-must-not-sign-tokens');
    vi.stubEnv('PAYMENT_KEY_SECRET', 'legacy-payment-secret-that-must-not-sign-tokens');

    expect(verifyAdminToken(tokenSignedWith('payment-secret-that-must-not-sign-tokens'))).toBeNull();
    expect(verifyAdminToken(tokenSignedWith('legacy-payment-secret-that-must-not-sign-tokens'))).toBeNull();
    expect(
      verifyAdminToken(tokenSignedWith('junkitout_production_jwt_fallback_secret_key_2026')),
    ).toBeNull();
    expect(() => signToken({ userId: 'test-user', phone: 'test-only', role: 'ADMIN' }))
      .toThrow('JWT_SECRET must be configured with at least 32 bytes');
    expect(verifyRootToken(tokenSignedWith('01234567890123456789012345678901'))).toBeNull();
  });

  test('both verifiers reject missing, invalid, and expired expiry claims', () => {
    const secret = 'ci-only-dedicated-jwt-secret-32-bytes';
    vi.stubEnv('JWT_SECRET', secret);

    const claims = {
      userId: 'test-user',
      phone: 'test-only',
      role: 'ADMIN',
    };
    const invalidExpiryClaims: Array<Record<string, unknown>> = [
      claims,
      { ...claims, exp: 0 },
      { ...claims, exp: -1 },
      { ...claims, exp: Math.floor(Date.now() / 1000) - 1 },
      { ...claims, exp: 'future' },
      { ...claims, exp: null },
      { ...claims, exp: false },
      { ...claims, exp: {} },
    ];

    for (const payload of invalidExpiryClaims) {
      const token = tokenSignedWith(secret, payload);
      expect(verifyRootToken(token)).toBeNull();
      expect(verifyAdminToken(token)).toBeNull();
    }
  });
});
