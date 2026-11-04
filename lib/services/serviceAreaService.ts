import { db } from '../db';
import {
  validateServiceArea,
  SERVICE_AREA_UNAVAILABLE_MESSAGE,
  APPROVED_SERVICE_ZONES,
} from '../validations/serviceArea';
import {
  BENGALURU_ZONES,
  DEFAULT_SERVICE_CHARGE,
  isPointInPolygon,
} from '../geofence';

interface CachedServiceArea {
  id: string;
  name: string;
  etaMinutes: number;
  basePickupCharge: number;
  status: string;
  parsedPolygon: [number, number][];
}

export const SERVICE_AREAS_CACHE_TTL_MS = 120_000; // 2 minutes cache TTL for zone boundaries

let serviceAreaCache: { areas: CachedServiceArea[]; expiresAt: number } | null = null;

export function invalidateServiceAreaCache(): void {
  serviceAreaCache = null;
}

export async function checkGeofenceServiceability(
  lat: number,
  lng: number,
  areaName?: string
): Promise<{
  serviceable: boolean;
  message: string;
  zone?: any;
}> {
  const point: [number, number] = [lat, lng];

  // 1. Check database service area boundary polygons (cached in-memory)
  const now = Date.now();
  let cachedAreas = serviceAreaCache && serviceAreaCache.expiresAt > now ? serviceAreaCache.areas : null;
  if (!cachedAreas) {
    try {
      const dbAreas = await db.serviceArea.findMany({
        where: { status: { in: ['ACTIVE', 'INACTIVE', 'BLOCKED', 'SUSPENDED', 'DISABLED'] } },
        take: 1000,
      });
      cachedAreas = [];
      for (const area of dbAreas) {
        try {
          const polygon: [number, number][] = JSON.parse(area.boundaryPolygon);
          cachedAreas.push({
            id: area.id,
            name: area.name,
            etaMinutes: area.etaMinutes,
            basePickupCharge: DEFAULT_SERVICE_CHARGE,
            status: area.status,
            parsedPolygon: polygon,
          });
        } catch (err) {
          console.error(`Failed to parse polygon for zone ${area.name}`, err);
        }
      }
      serviceAreaCache = { areas: cachedAreas, expiresAt: now + SERVICE_AREAS_CACHE_TTL_MS };
    } catch (err) {
      console.error('Database service area check error:', err);
    }
  }

  // 2. Check for explicit disabled / inactive / blocked status in database
  if (areaName && cachedAreas && cachedAreas.length > 0) {
    const normArea = areaName.trim().toLowerCase();
    const namedDbArea = cachedAreas.find(
      (a) => a.name.toLowerCase() === normArea || a.id.toLowerCase() === normArea || normArea.includes(a.name.toLowerCase())
    );
    if (namedDbArea && namedDbArea.status !== 'ACTIVE') {
      return {
        serviceable: false,
        message: `Service is currently disabled/inactive in ${namedDbArea.name}.`,
      };
    }
  }

  if (cachedAreas && cachedAreas.length > 0) {
    for (const area of cachedAreas) {
      if (isPointInPolygon(point, area.parsedPolygon)) {
        if (area.status !== 'ACTIVE') {
          return {
            serviceable: false,
            message: `Service is currently disabled/inactive in ${area.name}.`,
          };
        }
      }
    }
  }

  // 3. Centralized serviceability validation: STRICTLY BTM Layout & JP Nagar only
  const validation = validateServiceArea({
    lat,
    lng,
    area: areaName,
  });

  if (!validation.serviceable || !validation.zone) {
    return {
      serviceable: false,
      message: validation.message || SERVICE_AREA_UNAVAILABLE_MESSAGE,
    };
  }

  // 4. Verify whether the matched zone has an explicit inactive status in DB
  const matchedZoneId = validation.zone.id;
  if (cachedAreas && cachedAreas.length > 0) {
    const dbOverride = cachedAreas.find(
      (a) =>
        a.id.toLowerCase() === matchedZoneId ||
        a.name.toLowerCase().includes(matchedZoneId === 'btm-layout' ? 'btm' : 'jp nagar')
    );
    if (dbOverride && dbOverride.status !== 'ACTIVE') {
      return {
        serviceable: false,
        message: `Service is currently disabled/inactive in ${dbOverride.name}.`,
      };
    }
  }

  return {
    serviceable: true,
    message: `Location is inside active Junk It Out service zone: ${validation.zone.name}`,
    zone: validation.zone,
  };
}
