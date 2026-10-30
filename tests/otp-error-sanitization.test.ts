import assert from 'node:assert/strict';
import { afterEach, describe, it, vi } from 'vitest';

const { sendFast2SmsOtp, verifyFast2SmsOtp } = vi.hoisted(() => ({
  sendFast2SmsOtp: vi.fn(),
  verifyFast2SmsOtp: vi.fn(),
}));

vi.mock('../lib/auth/fast2sms', () => ({
  sendFast2SmsOtp,
  verifyFast2SmsOtp,
}));

import { sendOtp, verifyOtp } from '../lib/auth/otp';

afterEach(() => {
  sendFast2SmsOtp.mockReset();
  verifyFast2SmsOtp.mockReset();
});

describe('OTP provider error sanitization', () => {
  it('does not return provider error details from OTP send failures', async () => {
    sendFast2SmsOtp.mockResolvedValue({
      ok: false,
      errorDetails: 'provider secret and internal URL',
    });

    const result = await sendOtp('+919876543210', 'otp-send-test');

    assert.deepEqual(result, {
      success: false,
      status: 'provider_failed',
      retryAfterSeconds: 0,
      errorDetails: 'Unable to send OTP. Please try again.',
    });
  });

  it('does not return exception details from OTP send failures', async () => {
    sendFast2SmsOtp.mockRejectedValue(new Error('database password and internal URL'));

    const result = await sendOtp('+919876543211', 'otp-send-exception-test');

    assert.equal(result.success, false);
    assert.equal(result.status, 'provider_failed');
    assert.equal(result.errorDetails, 'Unable to send OTP. Please try again.');
    assert.doesNotMatch(result.errorDetails || '', /database password|internal URL/);
  });

  it('does not return provider or exception details from OTP verification failures', async () => {
    verifyFast2SmsOtp
      .mockResolvedValueOnce({
        ok: false,
        errorDetails: 'provider token and internal URL',
      })
      .mockRejectedValueOnce(new Error('authorization secret and stack trace'));

    const providerFailure = await verifyOtp(
      '+919876543212',
      '123456',
      'otp-verify-provider-test',
    );
    const exceptionFailure = await verifyOtp(
      '+919876543213',
      '123456',
      'otp-verify-exception-test',
    );

    assert.equal(providerFailure.valid, false);
    assert.equal(providerFailure.status, 'failed');
    assert.equal(
      providerFailure.errorDetails,
      'The OTP is invalid or expired. Please request a new code and try again.',
    );
    assert.equal(exceptionFailure.valid, false);
    assert.equal(exceptionFailure.status, 'failed');
    assert.equal(
      exceptionFailure.errorDetails,
      'The OTP is invalid or expired. Please request a new code and try again.',
    );
  });
});
