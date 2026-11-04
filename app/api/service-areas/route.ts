import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { SOUTH_BENGALURU_ZONES, DEFAULT_SERVICE_CHARGE } from '@/lib/geofence';
import { successResponse, errorResponse } from '@/lib/utils/apiResponse';
import { getAdminAuthorizationStatus, getAuthUser } from '@/lib/auth/middleware';

import { getCachedServiceAreas, setCachedServiceAreas, invalidateServiceAreasCache } from '@/lib/cache/serviceAreasCache';
import { invalidateServiceAreaCache } from '@/lib/services/serviceAreaService';

async function getAuditUserId(userId?: string | null): Promise<string | null> {
  if (!userId) return null;
  try {
    const user = await db.user.findFirst({ where: { id: userId }, select: { id: true } });
    return user ? user.id : null;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const cachedZones = getCachedServiceAreas();
    if (cachedZones) {
      const cachedResponse = successResponse(cachedZones);
      cachedResponse.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
      cachedResponse.headers.set('X-Cache', 'HIT');
      return cachedResponse;
    }

    const dbAreas = await db.serviceArea.findMany();
    const dbAreaById = new Map(dbAreas.map((a) => [a.id, a]));
    const dbAreaByName = new Map(dbAreas.map((a) => [a.name.toLowerCase().trim(), a]));
    const matchedDbIds = new Set<string>();

    const mergedZones = SOUTH_BENGALURU_ZONES.map((z) => {
      const isApprovedZone = z.id === 'btm-layout' || z.id === 'jp-nagar';
      const dbRecord = dbAreaById.get(z.id) || dbAreaByName.get(z.name.toLowerCase().trim());
      if (dbRecord) {
        matchedDbIds.add(dbRecord.id);
      }

      let effectiveStatus: 'ACTIVE' | 'INACTIVE' | 'TEMPORARY_BLOCKED' = isApprovedZone ? 'ACTIVE' : 'INACTIVE';
      if (dbRecord) {
        if (!isApprovedZone) {
          effectiveStatus = 'INACTIVE';
        } else if (dbRecord.status === 'INACTIVE' || dbRecord.status === 'TEMPORARY_BLOCKED') {
          effectiveStatus = dbRecord.status as any;
        }
      }

      return {
        ...z,
        id: z.id,
        dbId: dbRecord?.id || z.id,
        status: effectiveStatus,
        name: dbRecord?.name || z.name,
        etaMinutes: dbRecord?.etaMinutes ?? z.etaMinutes,
        basePickupCharge: DEFAULT_SERVICE_CHARGE,
      };
    });

    // Custom database service areas not present in pre-configured SOUTH_BENGALURU_ZONES
    const customAreas = dbAreas
      .filter(
        (a) =>
          !matchedDbIds.has(a.id) &&
          !SOUTH_BENGALURU_ZONES.some(
            (z) => z.id === a.id || z.name.toLowerCase().trim() === a.name.toLowerCase().trim()
          )
      )
      .map((a) => {
        let polygon: [number, number][] = [];
        try {
          polygon = typeof a.boundaryPolygon === 'string' ? JSON.parse(a.boundaryPolygon) : a.boundaryPolygon || [];
        } catch {
          polygon = [];
        }

        return {
          id: a.id,
          dbId: a.id,
          name: a.name,
          status: a.status as 'ACTIVE' | 'INACTIVE' | 'TEMPORARY_BLOCKED',
          etaMinutes: a.etaMinutes,
          basePickupCharge: a.basePickupCharge || DEFAULT_SERVICE_CHARGE,
          centerLat: a.centerLat,
          centerLng: a.centerLng,
          boundaryPolygon: polygon,
          isCustom: true,
        };
      });

    const allZones = [...mergedZones, ...customAreas];

    setCachedServiceAreas(allZones);

    const response = successResponse(allZones);
    response.headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    response.headers.set('X-Cache', 'MISS');
    return response;
  } catch (err: any) {
    console.error('Fetch service areas error:', err);
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

    const { id, status, name, etaMinutes, basePickupCharge, centerLat, centerLng } = await req.json().catch(() => ({}));

    if (!id) {
      return errorResponse('BAD_REQUEST', 'ServiceArea ID is required.', 400);
    }

    if (status && !['ACTIVE', 'INACTIVE', 'TEMPORARY_BLOCKED'].includes(status)) {
      return errorResponse('BAD_REQUEST', 'Status must be ACTIVE, INACTIVE, or TEMPORARY_BLOCKED.', 400);
    }

    const defaultZone = SOUTH_BENGALURU_ZONES.find(
      (z) => z.id === id || z.name.toLowerCase().trim() === id.toLowerCase().trim()
    );

    // Look up existing record: first by primary key ID, then by zone name/slug to prevent P2002 collisions
    let existing = await db.serviceArea.findUnique({ where: { id } }).catch(() => null);
    if (!existing) {
      existing = await db.serviceArea.findFirst({
        where: {
          OR: [
            { id },
            ...(defaultZone ? [{ name: defaultZone.name }] : []),
            { name: id },
          ],
        },
      }).catch(() => null);
    }

    // Guard against partial mock objects that lack id and name
    if (existing && !existing.id && !existing.name) {
      existing = null;
    }

    if (!existing && !defaultZone) {
      return errorResponse('NOT_FOUND', 'Service area not found.', 404);
    }

    // Check unique name constraint if renaming
    if (name && existing && existing.name && name !== existing.name) {
      const duplicate = await db.serviceArea.findUnique({ where: { name } });
      if (duplicate && duplicate.id !== existing.id) {
        return errorResponse('BAD_REQUEST', `A service area named "${name}" already exists.`, 400);
      }
    }

    const targetId = existing?.id || id;
    const updateData = {
      ...(status ? { status } : {}),
      ...(name ? { name } : {}),
      ...(etaMinutes !== undefined ? { etaMinutes: Number(etaMinutes) } : {}),
      ...(basePickupCharge !== undefined ? { basePickupCharge: Number(basePickupCharge) } : {}),
      ...(centerLat !== undefined ? { centerLat: Number(centerLat) } : {}),
      ...(centerLng !== undefined ? { centerLng: Number(centerLng) } : {}),
    };

    let updated;
    if (existing && existing.id && typeof (db.serviceArea as any).update === 'function') {
      // Existing record in DB: update by existing.id (real DB primary key)
      updated = await db.serviceArea.update({
        where: { id: existing.id },
        data: updateData,
      });
    } else {
      // Zone exists in default configuration but not yet in database: upsert
      updated = await db.serviceArea.upsert({
        where: { id: targetId },
        update: updateData,
        create: {
          id: targetId,
          name: name || defaultZone?.name || id,
          status: status || 'ACTIVE',
          etaMinutes: etaMinutes !== undefined ? Number(etaMinutes) : (defaultZone?.etaMinutes || 25),
          basePickupCharge: basePickupCharge !== undefined ? Number(basePickupCharge) : (defaultZone?.basePickupCharge || DEFAULT_SERVICE_CHARGE),
          boundaryPolygon: defaultZone?.boundaryPolygon ? JSON.stringify(defaultZone.boundaryPolygon) : '[]',
          centerLat: centerLat !== undefined ? Number(centerLat) : (defaultZone?.centerLat || 12.9166),
          centerLng: centerLng !== undefined ? Number(centerLng) : (defaultZone?.centerLng || 77.5996),
        },
      });
    }

    // Invalidate caches immediately
    invalidateServiceAreasCache();
    invalidateServiceAreaCache();

    try {
      const validUserId = await getAuditUserId(authUser?.userId);
      await db.auditLog.create({
        data: {
          userId: validUserId,
          userName: authUser?.name || 'Admin Operations',
          action: 'UPDATE_SERVICE_AREA',
          oldValue: `Area: ${existing?.id || id}, Status: ${existing?.status || 'DEFAULT'}`,
          newValue: `Area: ${updated.id}, Status: ${updated.status}`,
        },
      });
    } catch (auditErr) {
      console.warn('[AUDIT_LOG_CREATION_FAILED]', auditErr);
    }

    return successResponse(updated);
  } catch (err: any) {
    console.error('Update service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to update service area status.', 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    const {
      name,
      status = 'ACTIVE',
      etaMinutes = 25,
      basePickupCharge = DEFAULT_SERVICE_CHARGE,
      boundaryPolygon = [],
      centerLat = 12.9166,
      centerLng = 77.5996,
    } = await req.json().catch(() => ({}));

    if (!name || typeof name !== 'string' || !name.trim()) {
      return errorResponse('BAD_REQUEST', 'Service area name is required.', 400);
    }

    const trimmedName = name.trim();

    // Check duplicate name
    const existing = await db.serviceArea.findFirst({
      where: {
        OR: [
          { name: { equals: trimmedName, mode: 'insensitive' } },
        ],
      },
    });

    if (existing) {
      return errorResponse('BAD_REQUEST', `A service area named "${trimmedName}" already exists.`, 400);
    }

    const newArea = await db.serviceArea.create({
      data: {
        name: trimmedName,
        status: ['ACTIVE', 'INACTIVE', 'TEMPORARY_BLOCKED'].includes(status) ? status : 'ACTIVE',
        etaMinutes: Number(etaMinutes) || 25,
        basePickupCharge: Number(basePickupCharge) || DEFAULT_SERVICE_CHARGE,
        boundaryPolygon: typeof boundaryPolygon === 'string' ? boundaryPolygon : JSON.stringify(boundaryPolygon),
        centerLat: Number(centerLat) || 12.9166,
        centerLng: Number(centerLng) || 77.5996,
      },
    });

    // Invalidate caches
    invalidateServiceAreasCache();
    invalidateServiceAreaCache();

    try {
      const validUserId = await getAuditUserId(authUser?.userId);
      await db.auditLog.create({
        data: {
          userId: validUserId,
          userName: authUser?.name || 'Admin Operations',
          action: 'CREATE_SERVICE_AREA',
          newValue: `Area: ${newArea.id}, Name: ${newArea.name}, Status: ${newArea.status}`,
        },
      });
    } catch (auditErr) {
      console.warn('[AUDIT_LOG_CREATION_FAILED]', auditErr);
    }

    return successResponse(newArea, 201);
  } catch (err: any) {
    console.error('Create service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to create service area.', 500);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authUser = await getAuthUser(req);
    const authorizationStatus = getAdminAuthorizationStatus(authUser);
    if (authorizationStatus === 401) {
      return errorResponse('UNAUTHORIZED', 'Authentication is required.', 401);
    }
    if (authorizationStatus === 403) {
      return errorResponse('FORBIDDEN', 'Admin access required.', 403);
    }

    let id = req.nextUrl?.searchParams?.get('id');
    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body?.id;
    }

    if (!id) {
      return errorResponse('BAD_REQUEST', 'ServiceArea ID is required for deletion.', 400);
    }

    const defaultZone = SOUTH_BENGALURU_ZONES.find(
      (z) => z.id === id || z.name.toLowerCase().trim() === id?.toLowerCase().trim()
    );

    let existing = await db.serviceArea.findUnique({ where: { id } }).catch(() => null);
    if (!existing) {
      existing = await db.serviceArea.findFirst({
        where: {
          OR: [
            { id },
            ...(defaultZone ? [{ name: defaultZone.name }] : []),
            { name: id },
          ],
        },
      }).catch(() => null);
    }

    if (!existing) {
      return errorResponse('NOT_FOUND', 'Service area not found in database.', 404);
    }

    // Active order safety check: prevent deleting an area that has active orders
    const activeOrdersCount = await db.order.count({
      where: {
        status: {
          in: ['BOOKING_RECEIVED', 'ACCEPTED', 'ASSIGNED', 'OUT_FOR_PICKUP', 'ARRIVED'],
        },
        address: {
          OR: [
            { area: { contains: existing.name, mode: 'insensitive' } },
            { street: { contains: existing.name, mode: 'insensitive' } },
          ],
        },
      },
    });

    if (activeOrdersCount > 0) {
      return errorResponse(
        'BAD_REQUEST',
        `Cannot delete service area "${existing.name}" because it has ${activeOrdersCount} active order(s). Please complete or cancel active orders first.`,
        400
      );
    }

    // Delete dependent pricing rules first
    await db.pricingRule.deleteMany({
      where: { serviceAreaId: existing.id },
    });

    // Delete the service area
    await db.serviceArea.delete({
      where: { id: existing.id },
    });

    // Invalidate caches
    invalidateServiceAreasCache();
    invalidateServiceAreaCache();

    try {
      const validUserId = await getAuditUserId(authUser?.userId);
      await db.auditLog.create({
        data: {
          userId: validUserId,
          userName: authUser?.name || 'Admin Operations',
          action: 'DELETE_SERVICE_AREA',
          oldValue: `Area: ${existing.id}, Name: ${existing.name}`,
        },
      });
    } catch (auditErr) {
      console.warn('[AUDIT_LOG_CREATION_FAILED]', auditErr);
    }

    return successResponse({ deleted: true, id: existing.id, name: existing.name });
  } catch (err: any) {
    console.error('Delete service area error:', err);
    return errorResponse('INTERNAL_SERVER_ERROR', 'Failed to delete service area.', 500);
  }
}
