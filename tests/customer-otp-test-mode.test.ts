import { afterEach, describe, expect, test } from 'vitest';
import {
  isCustomerTestOtpPhone,
  isValidLocalOtpTestCode,
} from '../lib/auth/localOtpTest';

const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
  VERCEL: process.env.VERCEL,
  VERCEL_ENV: process.env.VERCEL_ENV,
  OTP_TEST_MODE_ENABLED: process.env.OTP_TEST_MODE_ENABLED,
  OTP_TEST_PHONE: process.env.OTP_TEST_PHONE,
};

function setEnv(values: Record<string, string | undefined>) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

afterEach(() => setEnv(originalEnv));

describe('customer test OTP deployment guard', () => {
  const testPhone = '9876543210';

  test('allows a matching test phone in local development', () => {
    setEnv({
      NODE_ENV: 'development',
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      OTP_TEST_MODE_ENABLED: 'true',
      OTP_TEST_PHONE: testPhone,
    });

    expect(isCustomerTestOtpPhone(testPhone)).toBe(true);
  });

  test('allows a matching test phone in Vercel Preview', () => {
    setEnv({
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'preview',
      OTP_TEST_MODE_ENABLED: 'true',
      OTP_TEST_PHONE: testPhone,
    });

    expect(isCustomerTestOtpPhone(`+91${testPhone}`)).toBe(true);
  });

  test('always disables test OTP in Vercel Production', () => {
    setEnv({
      NODE_ENV: 'production',
      VERCEL: '1',
      VERCEL_ENV: 'production',
      OTP_TEST_MODE_ENABLED: 'true',
      OTP_TEST_PHONE: testPhone,
    });

    expect(isCustomerTestOtpPhone(testPhone)).toBe(false);
  });

  test('does not enable test OTP without the new server-only flag', () => {
    setEnv({
      NODE_ENV: 'development',
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      OTP_TEST_MODE_ENABLED: undefined,
      OTP_TEST_PHONE: testPhone,
    });

    expect(isCustomerTestOtpPhone(testPhone)).toBe(false);
  });

  test('does not enable test OTP for a nonmatching phone', () => {
    setEnv({
      NODE_ENV: 'development',
      VERCEL: undefined,
      VERCEL_ENV: undefined,
      OTP_TEST_MODE_ENABLED: 'true',
      OTP_TEST_PHONE: testPhone,
    });

    expect(isCustomerTestOtpPhone('9876543211')).toBe(false);
  });

  test('accepts only six numeric digits as a test OTP', () => {
    expect(isValidLocalOtpTestCode('123456')).toBe(true);
    expect(isValidLocalOtpTestCode('12345')).toBe(false);
    expect(isValidLocalOtpTestCode('1234567')).toBe(false);
    expect(isValidLocalOtpTestCode('12a456')).toBe(false);
  });
});
