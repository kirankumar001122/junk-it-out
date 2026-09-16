/**
 * Geofencing & Service Area Validation for Junk It Out (Bengaluru-Wide)
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface ServiceZone {
  id: string;
  name: string;
  etaMinutes: number;
  basePickupCharge: number;
  status: 'ACTIVE' | 'INACTIVE' | 'TEMPORARY_BLOCKED';
  centerLat: number;
  centerLng: number;
  boundaryPolygon: [number, number][]; // [lat, lng] array
}

// Master Greater Bengaluru Boundary Polygon (Bounding BBMP Metropolitan Region)
export const BENGALURU_MASTER_POLYGON: [number, number][] = [
  [13.1800, 77.4500],
  [13.1800, 77.7800],
  [12.8000, 77.7800],
  [12.8000, 77.4500],
];

export const DEFAULT_SERVICE_CHARGE = 69;

// Pre-defined Bengaluru Service Zones (North, South, East, West, Central)
export const BENGALURU_ZONES: ServiceZone[] = [
  // SOUTH BENGALURU
  {
    id: 'jp-nagar',
    name: 'JP Nagar (Phases 1 to 9)',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9077,
    centerLng: 77.5854,
    boundaryPolygon: [
      [12.9200, 77.5750], [12.9200, 77.6000],
      [12.8850, 77.6000], [12.8850, 77.5750]
    ],
  },
  {
    id: 'jayanagar',
    name: 'Jayanagar (Blocks 1 to 9)',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9250,
    centerLng: 77.5938,
    boundaryPolygon: [
      [12.9400, 77.5780], [12.9400, 77.6050],
      [12.9150, 77.6050], [12.9150, 77.5780]
    ],
  },
  {
    id: 'electronic-city',
    name: 'Electronic City (Phase 1 & 2)',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.8452,
    centerLng: 77.6602,
    boundaryPolygon: [
      [12.8650, 77.6400], [12.8650, 77.6850],
      [12.8200, 77.6850], [12.8200, 77.6400]
    ],
  },
  {
    id: 'koramangala',
    name: 'Koramangala (Blocks 1 to 8)',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9352,
    centerLng: 77.6245,
    boundaryPolygon: [
      [12.9550, 77.6100], [12.9550, 77.6450],
      [12.9200, 77.6450], [12.9200, 77.6100]
    ],
  },
  {
    id: 'hsr-layout',
    name: 'HSR Layout (Sectors 1 to 7)',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9121,
    centerLng: 77.6446,
    boundaryPolygon: [
      [12.9300, 77.6300], [12.9300, 77.6650],
      [12.8950, 77.6650], [12.8950, 77.6300]
    ],
  },
  {
    id: 'btm-layout',
    name: 'BTM Layout (1st & 2nd Stage)',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9166,
    centerLng: 77.6101,
    boundaryPolygon: [
      [12.9300, 77.5980], [12.9300, 77.6250],
      [12.9000, 77.6250], [12.9000, 77.5980]
    ],
  },

  // NORTH BENGALURU
  {
    id: 'yelahanka',
    name: 'Yelahanka & Kogilu',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 13.1007,
    centerLng: 77.5963,
    boundaryPolygon: [
      [13.1500, 77.5600], [13.1500, 77.6300],
      [13.0700, 77.6300], [13.0700, 77.5600]
    ],
  },
  {
    id: 'hebbal',
    name: 'Hebbal, RT Nagar & Manyata',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 13.0358,
    centerLng: 77.5970,
    boundaryPolygon: [
      [13.0700, 77.5700], [13.0700, 77.6400],
      [13.0100, 77.6400], [13.0100, 77.5700]
    ],
  },

  // EAST BENGALURU
  {
    id: 'whitefield',
    name: 'Whitefield, ITPL & Kadugodi',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9698,
    centerLng: 77.7500,
    boundaryPolygon: [
      [13.0100, 77.7000], [13.0100, 77.7800],
      [12.9300, 77.7800], [12.9300, 77.7000]
    ],
  },
  {
    id: 'indiranagar-marathahalli',
    name: 'Indiranagar, Domlur & Marathahalli',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9784,
    centerLng: 77.6408,
    boundaryPolygon: [
      [13.0000, 77.6200], [13.0000, 77.7000],
      [12.9400, 77.7000], [12.9400, 77.6200]
    ],
  },

  // WEST BENGALURU
  {
    id: 'rajajinagar-malleshwaram',
    name: 'Rajajinagar & Malleshwaram',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9982,
    centerLng: 77.5530,
    boundaryPolygon: [
      [13.0300, 77.5300], [13.0300, 77.5800],
      [12.9700, 77.5800], [12.9700, 77.5300]
    ],
  },
  {
    id: 'vijayanagar-kengeri',
    name: 'Vijayanagar, Nagarbhavi & Kengeri',
    etaMinutes: 25,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9719,
    centerLng: 77.5300,
    boundaryPolygon: [
      [13.0000, 77.4700], [13.0000, 77.5500],
      [12.8900, 77.5500], [12.8900, 77.4700]
    ],
  },

  // CENTRAL BENGALURU
  {
    id: 'central-bengaluru',
    name: 'MG Road, Shivajinagar & Richmond Town',
    etaMinutes: 20,
    basePickupCharge: DEFAULT_SERVICE_CHARGE,
    status: 'ACTIVE',
    centerLat: 12.9756,
    centerLng: 77.6066,
    boundaryPolygon: [
      [13.0000, 77.5800], [13.0000, 77.6200],
      [12.9500, 77.6200], [12.9500, 77.5800]
    ],
  },
];

// Alias for backwards compatibility
export const SOUTH_BENGALURU_ZONES = BENGALURU_ZONES;

/**
 * Ray-casting algorithm to test if point is inside polygon
 */
export function isPointInPolygon(point: Point | [number, number], polygon: [number, number][]): boolean {
  let isInside = false;
  const x = Array.isArray(point) ? point[0] : point.lat;
  const y = Array.isArray(point) ? point[1] : point.lng;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];

    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }

  return isInside;
}

/**
 * Haversine formula to compute distance between two lat/lng points in KM
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Validates whether a location is within Junk It Out's supported Bengaluru service zones
 */
export function checkServiceArea(lat: number, lng: number, areaNameOrPincode?: string) {
  const point = { lat, lng };

  // 1. Check against master Bengaluru metropolitan bounding polygon
  const isInsideMaster = isPointInPolygon(point, BENGALURU_MASTER_POLYGON);

  // 2. Ray-casting polygon check against specific Bengaluru zones
  for (const zone of BENGALURU_ZONES) {
    if (zone.status === 'ACTIVE' && isPointInPolygon(point, zone.boundaryPolygon)) {
      return {
        serviceable: true,
        zone,
        message: `Junk It Out is ACTIVE in ${zone.name}! Pickup available in ${zone.etaMinutes} mins.`,
      };
    }
  }

  // 3. Distance check from zone centers (up to 8.0 km radius if inside master Bengaluru polygon)
  let closestZone: ServiceZone | null = null;
  let minDistance = Infinity;

  for (const zone of BENGALURU_ZONES) {
    const dist = calculateDistanceKm(lat, lng, zone.centerLat, zone.centerLng);
    if (dist < minDistance) {
      minDistance = dist;
      closestZone = zone;
    }
  }

  if (isInsideMaster && closestZone && minDistance <= 8.0 && closestZone.status === 'ACTIVE') {
    return {
      serviceable: true,
      zone: closestZone,
      message: `Junk It Out is ACTIVE in ${closestZone.name}! Pickup available in ${closestZone.etaMinutes + 5} mins.`,
    };
  }

  // 4. Area name matching fallback ONLY if inside Bengaluru bounding box
  if (isInsideMaster && areaNameOrPincode) {
    const query = areaNameOrPincode.toLowerCase();
    if (query.includes('bengaluru') || query.includes('bangalore')) {
      const fallbackZone = closestZone || BENGALURU_ZONES[0];
      return {
        serviceable: true,
        zone: fallbackZone,
        message: `Junk It Out is ACTIVE in ${fallbackZone.name}! Pickup available in ${fallbackZone.etaMinutes} mins.`,
      };
    }
  }

  return {
    serviceable: false,
    zone: null,
    message: "Sorry, we don't currently serve this location.",
  };
}
