import { invalidateAdminStatsCache } from './adminStatsCache';

let cachedAgents: any[] | null = null;
let cacheExpiry = 0;
export const AGENTS_CACHE_TTL_MS = 15_000; // 15 seconds short-lived cache

export function getCachedAdminAgents(): any[] | null {
  if (cachedAgents && Date.now() < cacheExpiry) {
    return cachedAgents;
  }
  return null;
}

export function setCachedAdminAgents(agents: any[], ttlMs: number = AGENTS_CACHE_TTL_MS): void {
  if (!Array.isArray(agents)) return;
  cachedAgents = [...agents];
  cacheExpiry = Date.now() + ttlMs;
}

export function invalidateAdminAgentsCache(): void {
  cachedAgents = null;
  cacheExpiry = 0;
}

export function invalidateAdminOperationsCaches(): void {
  invalidateAdminAgentsCache();
  invalidateAdminStatsCache();
}