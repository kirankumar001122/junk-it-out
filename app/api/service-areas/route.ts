import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getAuthUser } from '@/lib/auth/middleware';

export async function GET(req: NextRequest) {
  try {
    const dbAreas = await db.serviceArea.findMany();
    const dbAreaMap = new Map(dbAreas.map((a) => [a.id, a]));

    const mergedZones = SOUTH_BENGALURU_ZONES.map((z) => {
      const dbRecord = dbAreaMap.get(z.id);
      if (dbRecord) {
        return {
          ...z,
          status: dbRecord.status as 'ACTIVE' | 'INACTIVE' | 'TEMPORARY_BLOCKED',
          name: dbRecord.name || z.name,
          etaMinutes: dbRecord.etaMinutes ?? z.etaMinutes,
          basePickupCharge: dbRecord.basePickupCharge ?? z.basePickupCharge,
        };
      }
      return z;
    });

    return successResponse(mergedZones);
  } catch (err: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch service areas.', 500);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    if (!authUser || !['ADMIN', 'SUPER_ADMIN'].includes(authUser.role)) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const { id, status } = await req.json().catch(() => ({}));

    if (!id || !['ACTIVE', 'INACTIVE'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'Valid ServiceArea ID and status (ACTIVE | INACTIVE) required.', 400);
    }

    const defaultZone = SOUTH_BENGALURU_ZONES.find((z) => z.id === id);
    const existing = await db.serviceArea.findUnique({ where: { id } });

    if (!existing && !defaultZone) {
      return errorResponse('NOT_FOUND', 'Service area not found.', 404);
    }

    const updated = await db.serviceArea.upsert({
      where: { id },
      update: { status },
      create: {
        id,
        name: defaultZone?.name || id,
        status,
        etaMinutes: defaultZone?.etaMinutes || 25,
        basePickupCharge: defaultZone?.basePickupCharge || 49,
        boundaryPolygon: defaultZone?.boundaryPolygon ? JSON.stringify(defaultZone.boundaryPolygon) : '[]',
        centerLat: defaultZone?.centerLat || 12.9166,
        centerLng: defaultZone?.centerLng || 77.5996,
      },
    });

    return successResponse(updated);
  } catch (err: any) {
    console.error('Update service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update service area status.', 500);
  }
}

