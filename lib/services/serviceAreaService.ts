import { db } from '../db';

interface CachedServiceArea {
  id: string;
  name: string;
  etaMinutes: number;
  basePickupCharge: number;
  status: string;
  parsedPolygon: [number, number][];
}

let serviceAreaCache: { areas: CachedServiceArea[]; expiresAt: number } | null = null;

export function invalidateServiceAreaCache(): void {
  serviceAreaCache = null;
}

import { BENGALURU_ZONES, BENGALURU_MASTER_POLYGON, isPointInPolygon, calculateDistanceKm } from '../geofence';

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

  // 1. Check database service area boundary polygons (cached in-memory for 60s)
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
            basePickupCharge: area.basePickupCharge,
            status: area.status,
            parsedPolygon: polygon,
          });
        } catch (err) {
          console.error(`Failed to parse polygon for zone ${area.name}`, err);
        }
      }
      serviceAreaCache = { areas: cachedAreas, expiresAt: now + 60_000 };
    } catch (err) {
      console.error('Database service area check error:', err);
    }
  }

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
        if (area.status === 'ACTIVE') {
          return {
            serviceable: true,
            message: `Location is inside active Junk It Out service zone: ${area.name}`,
            zone: {
              id: area.id,
              name: area.name,
              etaMinutes: area.etaMinutes,
              basePickupCharge: area.basePickupCharge,
            },
          };
        } else {
          return {
            serviceable: false,
            message: `Service is currently disabled/inactive in ${area.name}.`,
          };
        }
      }
    }
  }

  if (areaName) {
    const normArea = areaName.trim().toLowerCase();
    const presetNamedZone = BENGALURU_ZONES.find(
      (z) => z.name.toLowerCase() === normArea || z.id.toLowerCase() === normArea || normArea.includes(z.name.toLowerCase())
    );
    if (presetNamedZone && presetNamedZone.status !== 'ACTIVE') {
      return {
        serviceable: false,
        message: `Service is currently disabled/inactive in ${presetNamedZone.name}.`,
      };
    }
  }

  // 2. Check preset Bengaluru zone polygons
  const presetZone = BENGALURU_ZONES.find((z) => isPointInPolygon(point, z.boundaryPolygon));
  if (presetZone) {
    if (presetZone.status !== 'ACTIVE') {
      return {
        serviceable: false,
        message: `Service is currently disabled/inactive in ${presetZone.name}.`,
      };
    }
    return {
      serviceable: true,
      message: `Location is inside active Bengaluru service zone: ${presetZone.name}`,
      zone: {
        id: presetZone.id,
        name: presetZone.name,
        etaMinutes: presetZone.etaMinutes,
        basePickupCharge: presetZone.basePickupCharge,
      },
    };
  }

  // 3. Distance check from closest zone center if point lies within Greater Bengaluru bounding box
  const isInsideBengaluruBox = isPointInPolygon(point, BENGALURU_MASTER_POLYGON);

  if (isInsideBengaluruBox) {
    let closestZone = BENGALURU_ZONES[0];
    let minDistance = Infinity;

    for (const zone of BENGALURU_ZONES) {
      const dist = calculateDistanceKm(lat, lng, zone.centerLat, zone.centerLng);
      if (dist < minDistance) {
        minDistance = dist;
        closestZone = zone;
      }
    }

    if (minDistance <= 10.0) {
      if (closestZone.status !== 'ACTIVE') {
        return {
          serviceable: false,
          message: `Service is currently disabled/inactive in ${closestZone.name}.`,
        };
      }
      return {
        serviceable: true,
        message: `Location is inside active Bengaluru service zone: ${closestZone.name}`,
        zone: {
          id: closestZone.id,
          name: closestZone.name,
          etaMinutes: closestZone.etaMinutes,
          basePickupCharge: closestZone.basePickupCharge,
        },
      };
    }
  }

  // 4. Locations outside Bengaluru bounds are strictly NOT SERVICEABLE
  return {
    serviceable: false,
    message: "Sorry, we don't currently serve this location.",
  };
}
