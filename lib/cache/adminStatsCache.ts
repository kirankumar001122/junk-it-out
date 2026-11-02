let cachedStats: { payload: any; expiresAt: number } | null = null;
export const STATS_CACHE_TTL_MS = 10_000;

export function getCachedAdminStats(): any | null {
  if (cachedStats && Date.now() < cachedStats.expiresAt) {
    return cachedStats.payload;
  }
  return null;
}

export function setCachedAdminStats(payload: any, ttlMs: number = STATS_CACHE_TTL_MS): void {
  cachedStats = {
    payload,
    expiresAt: Date.now() + ttlMs,
  };
}

export function invalidateAdminStatsCache(): void {
  cachedStats = null;
}
