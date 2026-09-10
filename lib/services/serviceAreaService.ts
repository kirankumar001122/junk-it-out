import { db } from '../db';
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

  // 1. Check database active service area boundary polygons
  try {
    const activeAreas = await db.serviceArea.findMany({
      where: { status: 'ACTIVE' },
    });

    for (const area of activeAreas) {
      try {
        const polygon: [number, number][] = JSON.parse(area.boundaryPolygon);
        if (isPointInPolygon(point, polygon)) {
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
        }
      } catch (err) {
        console.error(`Failed to parse polygon for zone ${area.name}`, err);
      }
    }
  } catch (err) {
    console.error('Database service area check error:', err);
  }

  // 2. Check preset Bengaluru zone polygons
  const matchedZone = BENGALURU_ZONES.find((z) =>
    z.status === 'ACTIVE' && isPointInPolygon(point, z.boundaryPolygon)
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
