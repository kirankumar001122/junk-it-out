let cachedZones: any = null;
let cacheExpiry = 0;
export const SERVICE_AREAS_CACHE_TTL_MS = 60_000;

export function getCachedServiceAreas(): any | null {
  if (cachedZones && Date.now() < cacheExpiry) {
    return cachedZones;
  }
  return null;
}

export function setCachedServiceAreas(zones: any, ttlMs: number = SERVICE_AREAS_CACHE_TTL_MS): void {
  cachedZones = zones;
  cacheExpiry = Date.now() + ttlMs;
}

export function invalidateServiceAreasCache(): void {
  cachedZones = null;
  cacheExpiry = 0;
}
