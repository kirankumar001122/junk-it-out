import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { invalidateServiceAreasCache } from '@/app/api/service-areas/route';
import { invalidateAdminStatsCache } from '@/app/api/admin/stats/route';

const DEFAULT_PRICING = {
  basePickupCharge: 49,
  minPickupCharge: 49,
  urgentSurcharge: 29,
  weekendFee: 19,
  heavyItemHandlingFee: 199,
  eWasteHandlingFee: 49,
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

    // Retrieve active basePickupCharge from ServiceArea
    const activeArea = await db.serviceArea.findFirst({
      select: { basePickupCharge: true },
    });

    // Retrieve last saved pricing configuration from AuditLog
    const latestAudit = await db.auditLog.findFirst({
      where: { action: 'UPDATE_PRICING_RULES' },
      orderBy: { timestamp: 'desc' },
    });

    let savedConfig = DEFAULT_PRICING;
    if (latestAudit?.newValue) {
      try {
        savedConfig = { ...DEFAULT_PRICING, ...JSON.parse(latestAudit.newValue) };
      } catch {
        // Fall back to default pricing
      }
    }

    if (activeArea?.basePickupCharge !== undefined) {
      savedConfig.basePickupCharge = activeArea.basePickupCharge;
    }

    return successResponse(savedConfig);
  } catch (error: any) {
    console.error('Fetch pricing error:', error);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch pricing rules.', 500);
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
      basePickupCharge,
      minPickupCharge,
      urgentSurcharge,
      weekendFee,
      heavyItemHandlingFee,
      eWasteHandlingFee,
    } = body;

    const numericFields = {
      basePickupCharge,
      minPickupCharge,
      urgentSurcharge,
      weekendFee,
      heavyItemHandlingFee,
      eWasteHandlingFee,
    };

    for (const [key, value] of Object.entries(numericFields)) {
      if (value !== undefined) {
        const num = Number(value);
        if (!Number.isFinite(num) || num < 0) {
          return errorResponse('INVALID_INPUT', `${key} must be a non-negative number.`, 400);
        }
      }
    }

    // Fetch previous rates
    const latestAudit = await db.auditLog.findFirst({
      where: { action: 'UPDATE_PRICING_RULES' },
      orderBy: { timestamp: 'desc' },
    });
    let previousRates = DEFAULT_PRICING;
    if (latestAudit?.newValue) {
      try {
        previousRates = { ...DEFAULT_PRICING, ...JSON.parse(latestAudit.newValue) };
      } catch {
        // use default
      }
    }

    const updatedRates = {
      basePickupCharge: Number(basePickupCharge ?? previousRates.basePickupCharge),
      minPickupCharge: Number(minPickupCharge ?? previousRates.minPickupCharge),
      urgentSurcharge: Number(urgentSurcharge ?? previousRates.urgentSurcharge),
      weekendFee: Number(weekendFee ?? previousRates.weekendFee),
      heavyItemHandlingFee: Number(heavyItemHandlingFee ?? previousRates.heavyItemHandlingFee),
      eWasteHandlingFee: Number(eWasteHandlingFee ?? previousRates.eWasteHandlingFee),
    };

    // 1. Update basePickupCharge across all service areas in the database
    await db.serviceArea.updateMany({
      data: {
        basePickupCharge: updatedRates.basePickupCharge,
      },
    });

    // 2. Persist audit trail log
    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'UPDATE_PRICING_RULES',
        oldValue: JSON.stringify(previousRates),
        newValue: JSON.stringify(updatedRates),
      },
    });

    // 3. Invalidate relevant caches
    invalidateServiceAreasCache();
    invalidateAdminStatsCache();

    return successResponse(updatedRates);
  } catch (error: any) {
    console.error('Update pricing error:', error);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update pricing rules.', 500);
  }
}

