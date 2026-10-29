import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SOUTH_BENGALURU_ZONES } from '@/lib/geofence';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

let cachedZones: any = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 60_000;

function invalidateServiceAreasCache() {
  cachedZones = null;
  cacheExpiry = 0;
}

export async function GET(req: NextRequest) {
  try {
    if (cachedZones && Date.now() < cacheExpiry) {
      const cachedResponse = successResponse(cachedZones);
      cachedResponse.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }

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

    cachedZones = mergedZones;
    cacheExpiry = Date.now() + CACHE_TTL_MS;

    const response = successResponse(mergedZones);
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('X-Cache', 'MISS');
    return response;
  } catch (err: any) {
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to fetch service areas.', 500);
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

    await db.auditLog.create({
      data: {
        userId: authUser?.userId || null,
        userName: authUser?.name || 'Admin Operations',
        action: 'UPDATE_SERVICE_AREA',
        oldValue: `Area: ${id}, Status: ${existing?.status || 'DEFAULT'}`,
        newValue: `Area: ${id}, Status: ${status}`,
      },
    }).catch(() => null);

    invalidateServiceAreasCache();
    return successResponse(updated);
  } catch (err: any) {
    console.error('Update service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update service area status.', 500);
  }
}

