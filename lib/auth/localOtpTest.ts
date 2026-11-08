import 'server-only';

function isCustomerTestOtpDeployment(): boolean {
  const vercelEnv = process.env.VERCEL_ENV?.trim().toLowerCase();
  const isLocalDevelopment =
    process.env.NODE_ENV?.trim().toLowerCase() === 'development' &&
    !process.env.VERCEL;
  const isVercelPreview = process.env.VERCEL === '1' && vercelEnv === 'preview';

  return isLocalDevelopment || isVercelPreview;
}

/** Existing local OTP support used by admin and agent authentication. */
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

/** Customer test OTP support for local development and Vercel Preview deployments. */
export function isCustomerTestOtpPhone(phone: string): boolean {
  if (
    !isCustomerTestOtpDeployment() ||
    process.env.OTP_TEST_MODE_ENABLED?.trim().toLowerCase() !== 'true'
  ) {
    return false;
  }

  const requestedPhone = phone.replace(/\D/g, '').slice(-10);
  if (requestedPhone.length !== 10) return false;

  const configuredPhone = (process.env.OTP_TEST_PHONE || '')
    .replace(/\D/g, '')
    .slice(-10);

  return configuredPhone.length === 10 && configuredPhone === requestedPhone;
}

export function isValidLocalOtpTestCode(code: string): boolean {
  return /^\d{6}$/.test(code.trim());
}
