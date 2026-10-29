import { db } from '../db';
import {
  BENGALURU_ZONES,
  BENGALURU_MASTER_POLYGON,
  isPointInPolygon,
  calculateDistanceKm,
} from '../geofence';

let cachedDbAreas: { data: any[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 60_000;

/**
 * Returns cached active/inactive service areas with 60s in-memory TTL.
 * Avoids saturating the PostgreSQL connection pool during autocomplete or map pin changes.
 */
async function getCachedServiceAreas(): Promise<any[]> {
  const now = Date.now();
  if (cachedDbAreas && now - cachedDbAreas.timestamp < CACHE_TTL_MS) {
    return cachedDbAreas.data;
  }

  try {
    const dbAreas = await db.serviceArea.findMany({
      where: { status: { in: ['ACTIVE', 'INACTIVE'] } },
      take: 1000,
    });
    cachedDbAreas = { data: dbAreas, timestamp: now };
    return dbAreas;
  } catch (err) {
    console.warn(
      '[SERVICE_AREA_DB_FALLBACK] Database service area query failed. Falling back to preset zones:',
      err
    );
    return cachedDbAreas ? cachedDbAreas.data : [];
  }
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

  // 1. Check cached database service area boundary polygons
  try {
    const dbAreas = await getCachedServiceAreas();
    if (dbAreas.length > 0) {
      for (const area of dbAreas) {
        try {
          const polygon: [number, number][] = JSON.parse(area.boundaryPolygon);
          if (isPointInPolygon(point, polygon)) {
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
        } catch (err) {
          console.error(`Failed to parse polygon for zone ${area.name}`, err);
        }
      }
    }
  } catch (err) {
    console.error('Service area lookup error:', err);
  }

  // 2. Check preset Bengaluru zone polygons
  const matchedZone = BENGALURU_ZONES.find(
    (z) => z.status === 'ACTIVE' && isPointInPolygon(point, z.boundaryPolygon)
  );

  if (matchedZone) {
    return {
      serviceable: true,
      message: `Location is inside active Bengaluru service zone: ${matchedZone.name}`,
      zone: {
        id: matchedZone.id,
        name: matchedZone.name,
        etaMinutes: matchedZone.etaMinutes,
        basePickupCharge: matchedZone.basePickupCharge,
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

    if (minDistance <= 10.0 && closestZone.status === 'ACTIVE') {
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
