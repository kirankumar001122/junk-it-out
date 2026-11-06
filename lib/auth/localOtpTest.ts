import 'server-only';

/** Development-only OTP test support for explicitly configured phone(s). */
export function isLocalOtpTestPhone(phone: string): boolean {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OTP_TEST_MODE?.trim().toLowerCase() !== 'true'
  ) {
    return false;
  }

  const requestedPhone = phone.replace(/\D/g, '').slice(-10);
  if (requestedPhone.length !== 10) return false;

  const rawConfigured = process.env.OTP_TEST_PHONE || '';
  const configuredList = rawConfigured
    .split(',')
    .map((p) => p.replace(/\D/g, '').slice(-10))
    .filter((p) => p.length === 10);

  return configuredList.includes(requestedPhone);
}

export function isValidLocalOtpTestCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}

