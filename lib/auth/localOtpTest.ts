import 'server-only';

/** Development-only OTP test support for one explicitly configured phone. */
export function isLocalOtpTestPhone(phone: string): boolean {
  if (
    process.env.NODE_ENV !== 'development' ||
    process.env.OTP_TEST_MODE?.trim().toLowerCase() !== 'true'
  ) {
    return false;
  }

  const configuredDigits = process.env.OTP_TEST_PHONE?.replace(/\D/g, '') || '';
  const configuredPhone = configuredDigits.slice(-10);
  const requestedPhone = phone.replace(/\D/g, '').slice(-10);

  return (
    configuredPhone.length === 10 &&
    requestedPhone.length === 10 &&
    configuredPhone === requestedPhone
  );
}

export function isValidLocalOtpTestCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
