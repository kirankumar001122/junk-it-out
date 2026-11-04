/**
 * Centralized Serviceability Validator for Junk It Out
 *
 * Strict Business Rule:
 * Junk It Out provides pickup services in ONLY two areas:
 * 1. BTM Layout, Bengaluru
 * 2. JP Nagar, Bengaluru
 *
 * Every other area (Whitefield, Koramangala, HSR Layout, Electronic City,
 * Marathahalli, or any other unsupported/unknown location) MUST be rejected.
 */

import { isPointInPolygon, calculateDistanceKm, Point } from '../geofence';

export const SERVICE_AREA_UNAVAILABLE_CODE = 'SERVICE_AREA_UNAVAILABLE';
export const SERVICE_AREA_UNAVAILABLE_MESSAGE =
  "Sorry! Our pickup service is currently available only in BTM Layout and JP Nagar, Bengaluru. We don't serve your location yet.";

export class ServiceAreaUnavailableError extends Error {
  readonly code = SERVICE_AREA_UNAVAILABLE_CODE;

  constructor(message: string = SERVICE_AREA_UNAVAILABLE_MESSAGE) {
    super(message);
    this.name = 'ServiceAreaUnavailableError';
  }
}

export interface ServiceZoneDefinition {
  id: 'btm-layout' | 'jp-nagar';
  name: string;
  shortName: string;
  etaMinutes: number;
  basePickupCharge: number;
  centerLat: number;
  centerLng: number;
  boundaryPolygon: [number, number][];
  pincodes: string[];
}

export const APPROVED_SERVICE_ZONES: ServiceZoneDefinition[] = [
  {
    id: 'jp-nagar',
    name: 'JP Nagar (Phases 1 to 9)',
    shortName: 'JP Nagar',
    etaMinutes: 20,
    basePickupCharge: 50,
    centerLat: 12.9077,
    centerLng: 77.5854,
    boundaryPolygon: [
      [12.9200, 77.5750],
      [12.9200, 77.6000],
      [12.8850, 77.6000],
      [12.8850, 77.5750],
    ],
    pincodes: ['560078', '560069'],
  },
  {
    id: 'btm-layout',
    name: 'BTM Layout (1st & 2nd Stage)',
    shortName: 'BTM Layout',
    etaMinutes: 20,
    basePickupCharge: 50,
    centerLat: 12.9166,
    centerLng: 77.6101,
    boundaryPolygon: [
      [12.9300, 77.5980],
      [12.9300, 77.6250],
      [12.9000, 77.6250],
      [12.9000, 77.5980],
    ],
    pincodes: ['560068', '560076'],
  },
];

export interface ServiceAreaValidationInput {
  lat?: number | null;
  lng?: number | null;
  area?: string | null;
  address?: string | null;
  street?: string | null;
  pincode?: string | null;
  formattedAddress?: string | null;
}

export interface ServiceAreaValidationResult {
  serviceable: boolean;
  zone: {
    id: 'btm-layout' | 'jp-nagar';
    name: string;
    etaMinutes: number;
    basePickupCharge: number;
  } | null;
  message: string;
  error?: string;
}

/**
 * Normalizes text: trims, lowercases, replaces multiple whitespaces with a single space.
 */
export function normalizeLocationText(value?: string | null): string {
  if (!value || typeof value !== 'string') return '';
  return value
    .toLowerCase()
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strict regex patterns for detecting BTM Layout
 */
const BTM_MATCH_REGEX =
  /\bbtm\b(?:\s+(?:layout|1st\s+stage|2nd\s+stage|stage\s+1|stage\s+2|first\s+stage|second\s+stage))?|\bbtm\s+layout\b/i;

/**
 * Strict regex patterns for detecting JP Nagar
 */
const JP_NAGAR_MATCH_REGEX =
  /\b(?:jp\s*nagar|j\.p\.\s*nagar|j\s+p\s+nagar|jayaprakash\s*narayan\s*nagar|jaya\s*prakash\s*nagar)\b/i;

/**
 * Explicit list of known unsupported localities in Bengaluru and elsewhere.
 * Used to immediately reject addresses specifying unsupported areas.
 */
export const UNSUPPORTED_LOCALITIES = [
  'whitefield',
  'koramangala',
  'hsr layout',
  'hsr',
  'electronic city',
  'electronics city',
  'marathahalli',
  'marathalli',
  'indiranagar',
  'indira nagar',
  'jayanagar',
  'jaya nagar',
  'bellandur',
  'hebbal',
  'yelahanka',
  'sarjapur',
  'banashankari',
  'rajajinagar',
  'malleshwaram',
  'kengeri',
  'vijayanagar',
  'mg road',
  'm.g. road',
  'shivajinagar',
  'richmond town',
  'domlur',
  'rt nagar',
  'manyata',
  'kadugodi',
  'itpl',
  'cooke town',
  'frazer town',
  'basavanagudi',
  'padmanabhanagar',
  'kammanahalli',
  'kalyan nagar',
  'nagavara',
  'thanisandra',
  'kr puram',
  'k.r. puram',
  'cv raman nagar',
  'mahadevapura',
  'bommanahalli',
  'begur',
  'hulimavu',
  'arekere',
  'gottigere',
  'channasandra',
  'varthur',
  'hoodi',
  'brookefield',
  'kundalahalli',
  'munnekollal',
  'murugeshpalya',
  'hal',
  'old airport road',
  'ulsoor',
  'halasuru',
  'shantinagar',
  'vasanth nagar',
  'sadashivanagar',
  'yeshwanthpur',
  'peenya',
  'mathikere',
  'sanjay nagar',
  'vidyaranyapura',
  'sahakar nagar',
  'dasarahalli',
  'nagarbhavi',
  // Non-Bengaluru major cities / regions
  'mumbai',
  'delhi',
  'new delhi',
  'noida',
  'gurugram',
  'gurgaon',
  'hyderabad',
  'chennai',
  'kolkata',
  'pune',
  'mysore',
  'mysuru',
  'mangalore',
  'mangaluru',
  'hubli',
  'dharwad',
  'belgaum',
  'belagavi',
  'coimbatore',
];

const UNSUPPORTED_LOCALITY_REGEX = new RegExp(
  `\\b(?:${UNSUPPORTED_LOCALITIES.map((loc) => loc.replace(/\./g, '\\.')).join('|')})\\b`,
  'i'
);

/**
 * Checks if a coordinate is strictly within BTM Layout boundary or tight radius.
 */
export function isCoordinateInBtm(lat: number, lng: number): boolean {
  const btmZone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'btm-layout')!;
  const point: Point = { lat, lng };

  if (isPointInPolygon(point, btmZone.boundaryPolygon)) {
    return true;
  }

  // Fallback to tight 1.5 km radius around center
  const dist = calculateDistanceKm(lat, lng, btmZone.centerLat, btmZone.centerLng);
  return dist <= 1.5;
}

/**
 * Checks if a coordinate is strictly within JP Nagar boundary or tight radius.
 */
export function isCoordinateInJpNagar(lat: number, lng: number): boolean {
  const jpZone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'jp-nagar')!;
  const point: Point = { lat, lng };

  if (isPointInPolygon(point, jpZone.boundaryPolygon)) {
    return true;
  }

  // Fallback to tight 2.0 km radius around center
  const dist = calculateDistanceKm(lat, lng, jpZone.centerLat, jpZone.centerLng);
  return dist <= 2.0;
}

/**
 * Checks whether a text string contains an unsupported locality name.
 */
export function containsUnsupportedLocality(text?: string | null): boolean {
  if (!text) return false;
  const norm = normalizeLocationText(text);
  return UNSUPPORTED_LOCALITY_REGEX.test(norm);
}

/**
 * Centralized Serviceability Validation Function
 *
 * Enforces the strict rule that ONLY BTM Layout and JP Nagar are serviceable.
 */
export function validateServiceArea(
  input: ServiceAreaValidationInput
): ServiceAreaValidationResult {
  const lat = typeof input.lat === 'number' && Number.isFinite(input.lat) && input.lat !== 0 ? input.lat : null;
  const lng = typeof input.lng === 'number' && Number.isFinite(input.lng) && input.lng !== 0 ? input.lng : null;

  const areaNorm = normalizeLocationText(input.area || '');
  const combinedText = [
    input.area,
    input.address,
    input.formattedAddress,
    input.street,
  ]
    .filter(Boolean)
    .join(' ');
  const fullText = normalizeLocationText(combinedText);
  const pincode = typeof input.pincode === 'string' ? input.pincode.trim() : '';

  // 1. Missing or completely empty location input
  if (!lat && !lng && !fullText) {
    return {
      serviceable: false,
      zone: null,
      message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
      error: SERVICE_AREA_UNAVAILABLE_CODE,
    };
  }

  // 2. Reject if area, formattedAddress, or address specifies a known unsupported locality
  if (
    containsUnsupportedLocality(input.area) ||
    containsUnsupportedLocality(input.formattedAddress) ||
    containsUnsupportedLocality(input.address)
  ) {
    return {
      serviceable: false,
      zone: null,
      message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
      error: SERVICE_AREA_UNAVAILABLE_CODE,
    };
  }

  // 3. Coordinate-based validation (if valid coordinates are provided)
  if (lat !== null && lng !== null) {
    const inBtmCoord = isCoordinateInBtm(lat, lng);
    const inJpCoord = isCoordinateInJpNagar(lat, lng);

    // If coordinates are clearly OUTSIDE both BTM Layout and JP Nagar
    if (!inBtmCoord && !inJpCoord) {
      return {
        serviceable: false,
        zone: null,
        message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
        error: SERVICE_AREA_UNAVAILABLE_CODE,
      };
    }

    // Coordinates are in BTM Layout
    if (inBtmCoord) {
      // If user explicitly specified an unsupported area in text, reject
      if (
        containsUnsupportedLocality(input.area) ||
        containsUnsupportedLocality(input.formattedAddress) ||
        containsUnsupportedLocality(input.address)
      ) {
        return {
          serviceable: false,
          zone: null,
          message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
          error: SERVICE_AREA_UNAVAILABLE_CODE,
        };
      }

      const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'btm-layout')!;
      return {
        serviceable: true,
        zone: {
          id: zone.id,
          name: zone.name,
          etaMinutes: zone.etaMinutes,
          basePickupCharge: zone.basePickupCharge,
        },
        message: `Location is inside active Junk It Out service zone: ${zone.name}`,
      };
    }

    // Coordinates are in JP Nagar
    if (inJpCoord) {
      // If user explicitly specified an unsupported area in text, reject
      if (
        containsUnsupportedLocality(input.area) ||
        containsUnsupportedLocality(input.formattedAddress) ||
        containsUnsupportedLocality(input.address)
      ) {
        return {
          serviceable: false,
          zone: null,
          message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
          error: SERVICE_AREA_UNAVAILABLE_CODE,
        };
      }

      const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'jp-nagar')!;
      return {
        serviceable: true,
        zone: {
          id: zone.id,
          name: zone.name,
          etaMinutes: zone.etaMinutes,
          basePickupCharge: zone.basePickupCharge,
        },
        message: `Location is inside active Junk It Out service zone: ${zone.name}`,
      };
    }
  }

  // 4. Text-only validation (when coordinates are absent, e.g. autocomplete input or address form)
  // Check if text has conflicting localities (e.g. "Whitefield near BTM Layout")
  const hasUnsupported = UNSUPPORTED_LOCALITY_REGEX.test(fullText);
  const isBtm = BTM_MATCH_REGEX.test(fullText);
  const isJp = JP_NAGAR_MATCH_REGEX.test(fullText);

  // If text mentions an unsupported locality, reject even if BTM/JP is mentioned in note
  if (hasUnsupported) {
    return {
      serviceable: false,
      zone: null,
      message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
      error: SERVICE_AREA_UNAVAILABLE_CODE,
    };
  }

  if (isBtm && !isJp) {
    const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'btm-layout')!;
    return {
      serviceable: true,
      zone: {
        id: zone.id,
        name: zone.name,
        etaMinutes: zone.etaMinutes,
        basePickupCharge: zone.basePickupCharge,
      },
      message: `Location is inside active Junk It Out service zone: ${zone.name}`,
    };
  }

  if (isJp && !isBtm) {
    const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'jp-nagar')!;
    return {
      serviceable: true,
      zone: {
        id: zone.id,
        name: zone.name,
        etaMinutes: zone.etaMinutes,
        basePickupCharge: zone.basePickupCharge,
      },
      message: `Location is inside active Junk It Out service zone: ${zone.name}`,
    };
  }

  // 5. Pincode validation if strictly BTM or JP Nagar
  if (pincode) {
    if (pincode === '560078' || pincode === '560069') {
      const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'jp-nagar')!;
      return {
        serviceable: true,
        zone: {
          id: zone.id,
          name: zone.name,
          etaMinutes: zone.etaMinutes,
          basePickupCharge: zone.basePickupCharge,
        },
        message: `Location is inside active Junk It Out service zone: ${zone.name}`,
      };
    }
    if (pincode === '560068' || pincode === '560076') {
      const zone = APPROVED_SERVICE_ZONES.find((z) => z.id === 'btm-layout')!;
      return {
        serviceable: true,
        zone: {
          id: zone.id,
          name: zone.name,
          etaMinutes: zone.etaMinutes,
          basePickupCharge: zone.basePickupCharge,
        },
        message: `Location is inside active Junk It Out service zone: ${zone.name}`,
      };
    }
  }

  // 6. Generic or unsupported area
  return {
    serviceable: false,
    zone: null,
    message: SERVICE_AREA_UNAVAILABLE_MESSAGE,
    error: SERVICE_AREA_UNAVAILABLE_CODE,
  };
}
