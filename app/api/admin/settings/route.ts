import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';

const DEFAULT_SETTINGS = {
  companyName: 'Junk It Out Technologies Private Limited',
  dpiitNumber: 'DIPP265455',
  sector: 'Green Technology / Waste Management',
  supportPhone: '+91 7676272709 / +91 9591883174',
  supportEmail: 'info@junkitout.in',
  dispatchSlaMinutes: 30,
  razorpayKeyId: 'rzp_live_JunkItOut2026',
  whatsappApiStatus: 'CONNECTED',
};

export async function GET(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const latestAudit = await db.auditLog.findFirst({
      where: { action: 'UPDATE_SYSTEM_SETTINGS' },
      orderBy: { timestamp: 'desc' },
    });

    let currentSettings = DEFAULT_SETTINGS;
    if (latestAudit?.newValue) {
      try {
        currentSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(latestAudit.newValue) };
      } catch {
        // Fall back to default settings
      }
    }

    return successResponse(currentSettings);
  } catch (error: any) {
    console.error('Fetch settings error:', error);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch settings.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const body = await req.json().catch(() => ({}));
    const {
      companyName,
      dpiitNumber,
      sector,
      supportPhone,
      supportEmail,
      dispatchSlaMinutes,
      razorpayKeyId,
      whatsappApiStatus,
    } = body;

    if (!companyName || typeof companyName !== 'string' || !companyName.trim()) {
      return errorResponse('INVALID_INPUT', 'Registered entity name is required.', 400);
    }

    const latestAudit = await db.auditLog.findFirst({
      where: { action: 'UPDATE_SYSTEM_SETTINGS' },
      orderBy: { timestamp: 'desc' },
    });
    let previousSettings = DEFAULT_SETTINGS;
    if (latestAudit?.newValue) {
      try {
        previousSettings = { ...DEFAULT_SETTINGS, ...JSON.parse(latestAudit.newValue) };
      } catch {
        // default
      }
    }

    const updatedSettings = {
      companyName: companyName.trim(),
      dpiitNumber: typeof dpiitNumber === 'string' ? dpiitNumber.trim() : previousSettings.dpiitNumber,
      sector: typeof sector === 'string' ? sector.trim() : previousSettings.sector,
      supportPhone: typeof supportPhone === 'string' ? supportPhone.trim() : previousSettings.supportPhone,
      supportEmail: typeof supportEmail === 'string' ? supportEmail.trim() : previousSettings.supportEmail,
      dispatchSlaMinutes: Number(dispatchSlaMinutes) || previousSettings.dispatchSlaMinutes,
      razorpayKeyId: typeof razorpayKeyId === 'string' ? razorpayKeyId.trim() : previousSettings.razorpayKeyId,
      whatsappApiStatus: typeof whatsappApiStatus === 'string' ? whatsappApiStatus.trim() : previousSettings.whatsappApiStatus,
    };

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'UPDATE_SYSTEM_SETTINGS',
        oldValue: JSON.stringify(previousSettings),
        newValue: JSON.stringify(updatedSettings),
      },
    });

    return successResponse(updatedSettings);
  } catch (error: any) {
    console.error('Update settings error:', error);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update settings.', 500);
  }
}

