/**
 * Geofencing & Service Area Definitions for Standalone Admin Dashboard
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

export const SOUTH_BENGALURU_ZONES: ServiceZone[] = [
  {
    id: 'jp-nagar',
    name: 'JP Nagar (Phases 1 to 9)',
    etaMinutes: 20,
    basePickupCharge: 69,
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
    basePickupCharge: 69,
    status: 'ACTIVE',
    centerLat: 12.9250,
    centerLng: 77.5938,
    boundaryPolygon: [
      [12.9400, 77.5780], [12.9400, 77.6050],
      [12.9150, 77.6050], [12.9150, 77.5780]
    ],
  },
  {
    id: 'banashankari',
    name: 'Banashankari (Stages 1 to 6)',
    etaMinutes: 25,
    basePickupCharge: 69,
    status: 'ACTIVE',
    centerLat: 12.9255,
    centerLng: 77.5468,
    boundaryPolygon: [
      [12.9450, 77.5350], [12.9450, 77.5700],
      [12.9000, 77.5700], [12.9000, 77.5350]
    ],
  },
  {
    id: 'btm-layout',
    name: 'BTM Layout (Stages 1 & 2)',
    etaMinutes: 20,
    basePickupCharge: 69,
    status: 'ACTIVE',
    centerLat: 12.9166,
    centerLng: 77.6101,
    boundaryPolygon: [
      [12.9300, 77.6000], [12.9300, 77.6250],
      [12.9050, 77.6250], [12.9050, 77.6000]
    ],
  },
  {
    id: 'hsr-layout',
    name: 'HSR Layout (Sectors 1 to 7)',
    etaMinutes: 25,
    basePickupCharge: 69,
    status: 'ACTIVE',
    centerLat: 12.9121,
    centerLng: 77.6445,
    boundaryPolygon: [
      [12.9250, 77.6300], [12.9250, 77.6600],
      [12.8950, 77.6600], [12.8950, 77.6300]
    ],
  },
];
