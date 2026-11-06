import { db } from '@/lib/db';

export interface SystemSettingsConfig {
  companyName: string;
  dpiitNumber: string;
  sector: string;
  supportPhone: string;
  supportEmail: string;
  headquarters: string;
  dispatchSlaMinutes: number;
  autoAssignEnabled: boolean;
  instantQuotation: boolean;
  maxServiceRadiusKm: number;
  operatingHours: string;
  razorpayKeyId: string;
  whatsappApiStatus: 'CONNECTED' | 'MAINTENANCE' | 'DISCONNECTED';
  smsGatewayStatus: 'OPERATIONAL' | 'DEGRADED' | 'OFFLINE';
  sessionTimeoutMinutes: number;
  requireDangerousActionOtp: boolean;
}

export const DEFAULT_SETTINGS: SystemSettingsConfig = {
  companyName: 'Junk It Out Technologies Private Limited',
  dpiitNumber: 'DIPP265455',
  sector: 'Green Technology / Waste Management',
  supportPhone: '+91 7676272709 / +91 9591883174',
  supportEmail: 'support@junkitout.in',
  headquarters: 'Bengaluru, Karnataka, India',
  dispatchSlaMinutes: 30,
  autoAssignEnabled: true,
  instantQuotation: true,
  maxServiceRadiusKm: 25,
  operatingHours: '08:00 AM - 08:00 PM',
  razorpayKeyId: 'rzp_live_JunkItOut2026',
  whatsappApiStatus: 'CONNECTED',
  smsGatewayStatus: 'OPERATIONAL',
  sessionTimeoutMinutes: 60,
  requireDangerousActionOtp: true,
};

export type SettingsValidationResult =
  | { valid: true; config: SystemSettingsConfig; reason?: undefined }
  | { valid: false; reason: string; config?: undefined };

export function validateSettingsConfig(
  candidate: any
): SettingsValidationResult {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return { valid: false, reason: 'Settings candidate is not an object.' };
  }

  // Required string fields
  if (typeof candidate.companyName !== 'string' || candidate.companyName.trim().length < 3) {
    return { valid: false, reason: 'Registered company name must be at least 3 characters.' };
  }
  if (typeof candidate.dpiitNumber !== 'string' || !candidate.dpiitNumber.trim()) {
    return { valid: false, reason: 'DPIIT certificate number is required.' };
  }
  if (typeof candidate.sector !== 'string' || !candidate.sector.trim()) {
    return { valid: false, reason: 'Industry sector is required.' };
  }
  if (typeof candidate.supportPhone !== 'string' || !candidate.supportPhone.trim()) {
    return { valid: false, reason: 'Customer support phone number is required.' };
  }
  if (typeof candidate.supportEmail !== 'string') {
    return { valid: false, reason: 'Customer support email is required.' };
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(candidate.supportEmail.trim())) {
    return { valid: false, reason: 'Please provide a valid support email address.' };
  }
  if (typeof candidate.headquarters !== 'string' || !candidate.headquarters.trim()) {
    return { valid: false, reason: 'Headquarters operational address is required.' };
  }
  if (typeof candidate.operatingHours !== 'string' || !candidate.operatingHours.trim()) {
    return { valid: false, reason: 'Operating hours schedule is required.' };
  }
  if (typeof candidate.razorpayKeyId !== 'string' || !candidate.razorpayKeyId.trim()) {
    return { valid: false, reason: 'Payment gateway Razorpay Key ID is required.' };
  }

  // Numeric fields and boundaries
  const sla = Number(candidate.dispatchSlaMinutes);
  if (!Number.isFinite(sla) || sla < 5 || sla > 300) {
    return { valid: false, reason: 'Dispatch SLA target must be between 5 and 300 minutes.' };
  }

  const radius = Number(candidate.maxServiceRadiusKm);
  if (!Number.isFinite(radius) || radius < 1 || radius > 150) {
    return { valid: false, reason: 'Maximum service radius must be between 1 and 150 km.' };
  }

  const timeout = Number(candidate.sessionTimeoutMinutes);
  if (!Number.isFinite(timeout) || timeout < 5 || timeout > 1440) {
    return { valid: false, reason: 'Session inactivity timeout must be between 5 and 1440 minutes.' };
  }

  // Boolean fields
  if (typeof candidate.autoAssignEnabled !== 'boolean') {
    return { valid: false, reason: 'autoAssignEnabled must be a boolean.' };
  }
  if (typeof candidate.instantQuotation !== 'boolean') {
    return { valid: false, reason: 'instantQuotation must be a boolean.' };
  }
  if (typeof candidate.requireDangerousActionOtp !== 'boolean') {
    return { valid: false, reason: 'requireDangerousActionOtp must be a boolean.' };
  }

  // Enum statuses
  const allowedWhatsapp = ['CONNECTED', 'MAINTENANCE', 'DISCONNECTED'];
  if (!allowedWhatsapp.includes(candidate.whatsappApiStatus)) {
    return { valid: false, reason: `whatsappApiStatus must be one of: ${allowedWhatsapp.join(', ')}.` };
  }

  const allowedSms = ['OPERATIONAL', 'DEGRADED', 'OFFLINE'];
  if (!allowedSms.includes(candidate.smsGatewayStatus)) {
    return { valid: false, reason: `smsGatewayStatus must be one of: ${allowedSms.join(', ')}.` };
  }

  return {
    valid: true,
    config: {
      companyName: candidate.companyName.trim(),
      dpiitNumber: candidate.dpiitNumber.trim(),
      sector: candidate.sector.trim(),
      supportPhone: candidate.supportPhone.trim(),
      supportEmail: candidate.supportEmail.trim(),
      headquarters: candidate.headquarters.trim(),
      dispatchSlaMinutes: sla,
      autoAssignEnabled: candidate.autoAssignEnabled,
      instantQuotation: candidate.instantQuotation,
      maxServiceRadiusKm: radius,
      operatingHours: candidate.operatingHours.trim(),
      razorpayKeyId: candidate.razorpayKeyId.trim(),
      whatsappApiStatus: candidate.whatsappApiStatus,
      smsGatewayStatus: candidate.smsGatewayStatus,
      sessionTimeoutMinutes: timeout,
      requireDangerousActionOtp: candidate.requireDangerousActionOtp,
    },
  };
}

export interface AuthoritativeSettingsResult {
  success: boolean;
  settings?: SystemSettingsConfig;
  recordId?: string | null;
  batchesFetched?: number;
  error?: 'CORRUPT_SETTINGS_HISTORY' | 'FETCH_FAILED';
  message?: string;
}

export async function getAuthoritativeSettings(
  batchSize: number = 10
): Promise<AuthoritativeSettingsResult> {
  let cursorId: string | undefined = undefined;
  let totalRecordsExamined = 0;
  let hasHistoricalRecords = false;
  let batchesFetched = 0;

  while (true) {
    batchesFetched++;
    const batch: Array<{ id: string; newValue: string | null; timestamp: Date }> = await db.auditLog.findMany({
      where: { action: 'UPDATE_SYSTEM_SETTINGS', NOT: { newValue: null } },
      orderBy: [
        { timestamp: 'desc' },
        { id: 'desc' },
      ],
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      take: batchSize,
      select: { id: true, newValue: true, timestamp: true },
    });

    if (batch.length === 0) {
      break;
    }

    hasHistoricalRecords = true;

    for (const record of batch) {
      totalRecordsExamined++;
      if (record.newValue) {
        try {
          const parsed = JSON.parse(record.newValue);
          const validation = validateSettingsConfig(parsed);
          if (validation.valid) {
            return {
              success: true,
              settings: validation.config,
              recordId: record.id,
              batchesFetched,
            };
          }
        } catch {
          // JSON parse failed; skip candidate and continue scanning history
        }
      }
    }

    cursorId = batch[batch.length - 1].id;
    if (batch.length < batchSize) {
      break;
    }
  }

  if (hasHistoricalRecords) {
    console.error(`[SETTINGS_ERROR] Corrupt settings history: ${totalRecordsExamined} records examined across ${batchesFetched} batch(es); none valid.`);
    return {
      success: false,
      error: 'CORRUPT_SETTINGS_HISTORY',
      message: 'All historical system settings records in the audit log are malformed or invalid.',
    };
  }

  return {
    success: true,
    settings: { ...DEFAULT_SETTINGS },
    recordId: null,
    batchesFetched,
  };
}
