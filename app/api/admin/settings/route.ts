import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import {
  SystemSettingsConfig,
  DEFAULT_SETTINGS,
  validateSettingsConfig,
  getAuthoritativeSettings,
} from '@/lib/admin/settingsConfig';

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

    const authResult = await getAuthoritativeSettings();
    if (!authResult.success || !authResult.settings) {
      return errorResponse(
        authResult.error || 'INTERNAL_SERVER_ERROR',
        authResult.message || 'Failed to retrieve authoritative system settings.',
        500
      );
    }

    return successResponse(authResult.settings);
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

    // Fetch previous valid settings to populate defaults for partial payload and old-value diff
    const prevResult = await getAuthoritativeSettings();
    const previousSettings = prevResult.success && prevResult.settings
      ? prevResult.settings
      : { ...DEFAULT_SETTINGS };

    // Merge candidate settings
    const candidateSettings = {
      ...previousSettings,
      ...body,
      // Ensure numeric conversions if provided
      ...(body.dispatchSlaMinutes !== undefined ? { dispatchSlaMinutes: Number(body.dispatchSlaMinutes) } : {}),
      ...(body.maxServiceRadiusKm !== undefined ? { maxServiceRadiusKm: Number(body.maxServiceRadiusKm) } : {}),
      ...(body.sessionTimeoutMinutes !== undefined ? { sessionTimeoutMinutes: Number(body.sessionTimeoutMinutes) } : {}),
    };

    // Shared schema validation
    const validation = validateSettingsConfig(candidateSettings);
    if (!validation.valid) {
      return errorResponse('INVALID_INPUT', validation.reason || 'Invalid settings input.', 400);
    }

    const updatedSettings = validation.config;
    const ipAddress = req.headers.get('x-forwarded-for') || '127.0.0.1';

    try {
      await db.auditLog.create({
        data: {
          userId: authUser?.userId || null,
          userName: authUser?.name || 'Admin Operations',
          action: 'UPDATE_SYSTEM_SETTINGS',
          oldValue: JSON.stringify(previousSettings),
          newValue: JSON.stringify(updatedSettings),
          ipAddress,
        },
      });
    } catch (auditErr: any) {
      // If foreign key constraint fails (e.g. synthetic test userId), record audit with userId: null
      if (auditErr?.code === 'P2003' || auditErr?.message?.includes('Foreign key')) {
        await db.auditLog.create({
          data: {
            userId: null,
            userName: authUser?.name || 'Admin Operations',
            action: 'UPDATE_SYSTEM_SETTINGS',
            oldValue: JSON.stringify(previousSettings),
            newValue: JSON.stringify(updatedSettings),
            ipAddress,
          },
        });
      } else {
        throw auditErr;
      }
    }

    return successResponse(updatedSettings);
  } catch (error: any) {
    console.error('Update settings error:', error);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update settings.', 500);
  }
}

export async function POST() {
  return NextResponse.json(
    { success: false, message: 'Settings should be updated via PUT requests.' },
    { status: 405, headers: { Allow: 'GET, PUT' } }
  );
}

export async function DELETE() {
  return NextResponse.json(
    { success: false, message: 'Settings records cannot be deleted.' },
    { status: 405, headers: { Allow: 'GET, PUT' } }
  );
}
